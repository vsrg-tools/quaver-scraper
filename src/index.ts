import playwright, { Browser, Page, BrowserContext } from "playwright";
import {
  S3Client,
  ListObjectsCommandInput,
  ListObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import axios from "axios";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { createInterface, Interface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import type { QuaverMapset } from "./structures";

import * as dotenv from "dotenv";
dotenv.config();

class QuaverScraper {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  user_agent: string;
  quaver_session: string;
  cf_clearance: string;

  s3: S3Client;
  bucket: string;

  headless: boolean;
  force_sync: boolean;
  upload: boolean;
  redownload: boolean;

  rl: Interface;

  mapset_ids: number[];
  uploaded_mapsets: string[];

  constructor({
    headless = true,
    force_sync = false,
    redownload = false,
    upload_to_s3 = true,
  }) {
    this.headless = headless;
    this.force_sync = force_sync;
    this.upload = upload_to_s3;
    this.redownload = redownload;

    this.rl = createInterface({ input, output });
    this.s3 = new S3Client({ region: "us-east-1" });
    this.bucket = process.env.BUCKET_NAME;
  }

  async run(): Promise<void> {
    this.mapset_ids = await this.fetch_mapset_ids();

    if (this.upload) {
      this.uploaded_mapsets = (
        await this.listAllObjectsFromS3Bucket(this.bucket, "mapsets")
      ).map((i) => i.replace("mapsets/", ""));
    }

    await this.sync_db();

    this.browser = await playwright.firefox.launch({ headless: this.headless });

    if (existsSync("storageState.json")) {
      this.context = await this.browser.newContext({
        storageState: "storageState.json",
      });
    } else this.context = await this.browser.newContext();

    this.page = await this.context.newPage();

    await this.get_cookies(true);

    console.log("Downloading mapsets...");
    for (const [i, id] of this.mapset_ids.entries()) {
      await this.download_map(id, i);
    }

    console.log("Everything is up-to-date 😎");
    await this.browser.close();
  }

  private async get_cookies(use_existing = false): Promise<void> {
    await this.page.goto("https://quavergame.com/", { timeout: 60000 });
    await this.page.waitForSelector("#homepage");

    const cookies = await this.context.cookies();

    this.user_agent = await this.page.evaluate(() => navigator.userAgent);

    this.cf_clearance = cookies.filter(
      (i) => i.name === "cf_clearance"
    )[0].value;

    // try using the existing quaver_session first
    if (use_existing) {
      this.quaver_session = cookies.filter(
        (i) => i.name === "quaver_session"
      )[0].value;
    } else {
      this.quaver_session = await this.rl.question(
        "Enter quaver_session cookie: "
      );

      await this.context.addCookies([
        {
          name: "quaver_session",
          value: this.quaver_session,
          domain: "quavergame.com",
          path: "/",
          httpOnly: true,
        },
      ]);

      await this.page.context().storageState({ path: "storageState.json" });
    }
  }

  private async fetch_mapset_ids(): Promise<number[]> {
    const resp = await axios.get(
      "https://api.quavergame.com/v1/mapsets/ranked"
    );

    return resp.data.mapsets;
  }

  private async download_map(id: number, i: number) {
    const fileName = `${id}.qp`;

    const dir = __dirname + "/../download";
    if (!this.upload) {
      if (!existsSync(dir)) {
        mkdirSync(dir);
      }
    }

    if (!this.redownload) {
      if (this.upload && this.uploaded_mapsets.includes(fileName)) {
        // console.log("Already uploaded to bucket. Skipping...");
        return;
      } else if (existsSync(`${dir}/${fileName}`)) {
        // console.log("Already downloaded. Skipping...");
        return;
      }
    }

    console.log(
      `Downloading mapset ${id}... (${i + 1}/${this.mapset_ids.length})`
    );
    try {
      const resp = await axios.get(
        `https://quavergame.com/download/mapset/${id}`,
        {
          responseType: "arraybuffer",
          maxRedirects: 5,
          headers: {
            Cookie: `cf_clearance=${this.cf_clearance}; quaver_session=${this.quaver_session}`,
            "User-Agent": this.user_agent,
          },
        }
      );

      if (resp.headers["content-type"] !== "application/octet-stream")
        throw new Error("Failed to download .qp: response is not a stream.");

      if (this.upload) {
        console.log(`Uploading ${fileName} to s3 bucket.`);
        this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: `mapsets/${fileName}`,
            Body: resp.data,
          })
        );
      } else {
        writeFileSync(`${dir}/${fileName}`, resp.data);
      }
    } catch (err) {
      console.log("Failed to download. Refetching cookies...");
      await this.get_cookies();
      console.log(`Trying to download mapset ${id} again...`);
      await this.download_map(id, i);
    }

    return;
  }

  private async sync_db() {
    console.log("Syncing database...");

    const existing = await (
      await prisma.mapset.findMany({ select: { id: true } })
    ).map((i) => i.id);
    const count = this.mapset_ids.length;

    for (const [i, id] of this.mapset_ids.entries()) {
      if (existing.includes(id) && !this.force_sync) {
        continue;
      }

      console.log(`Syncing mapset ${id} to database... (${i + 1}/${count})`);
      try {
        const resp = await axios.get(
          `https://api.quavergame.com/v1/mapsets/${id}`
        );

        const { maps, ...mapset } = resp.data.mapset as QuaverMapset;

        await prisma.mapset.upsert({
          where: { id: mapset.id },
          update: mapset,
          create: mapset,
        });

        await prisma.map.createMany({
          data: maps,
          skipDuplicates: true,
        });
      } catch (err) {
        console.log(err);
        console.log(`Unable to sync mapset ${id}`);
      }
    }
  }

  // https://gist.github.com/hmontazeri/e9493c2110d4640a5d10429ccbafb616
  private async listAllObjectsFromS3Bucket(bucket: string, prefix: string) {
    let isTruncated = true;
    let marker: string;
    const elements = [];
    while (isTruncated) {
      let params: ListObjectsCommandInput = { Bucket: bucket };
      if (prefix) params.Prefix = prefix;
      if (marker) params.Marker = marker;
      try {
        const response = await this.s3.send(new ListObjectsCommand(params));
        response.Contents.forEach((item) => {
          elements.push(item.Key);
        });
        isTruncated = response.IsTruncated;
        if (isTruncated) {
          marker = response.Contents.slice(-1)[0].Key;
        }
      } catch (error) {
        throw error;
      }
    }
    return elements;
  }
}
new QuaverScraper({ upload_to_s3: true }).run().then(() => process.exit(1));
