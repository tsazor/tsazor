/**
 * Blazor's InputFile E2E tests (src/Components/test/E2ETest/Tests/InputFileTest.cs, release/11.0) against
 * Tsazor's InputFile, on the ported page InputFileComponent. Files go through a temporary directory, as
 * Blazor's TempFile does; Playwright's setInputFiles stands for Selenium's SendKeys(path).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { byId, exists, textOf, waitEqual, waitTrue } from "../lib/harness.mjs";

export const group = "A. Uploads, the file limits, image conversion and cancel";

/** Blazor's TempFile: a file in the test's own directory, named by a GUID. */
function tempFile(directory, extension, contents) {
  const bytes = typeof contents === "string" ? Buffer.from(contents, "ascii") : contents;
  const name = `${randomUUID().replaceAll("-", "")}.${extension}`;
  const filePath = path.join(directory, name);
  writeFileSync(filePath, bytes);
  return { name, path: filePath, contents: bytes, text: bytes.toString("ascii") };
}

/** InitializeAsyncCore's temporary directory and MountTestComponent<InputFileComponent>; Dispose removes it. */
function withPage(body) {
  return async (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "blazor-parity-input-file-"));
    try {
      await t.mount("InputFileComponent");
      await body(t, directory);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

/** The checks Blazor repeats for every uploaded text file. */
async function assertUploaded(page, file) {
  const fileContainer = await exists(page, byId(`file-${file.name}`));
  const field = (id) => fileContainer.locator(byId(id));

  // Validate that the file was uploaded correctly and all fields are present
  await waitTrue(async () => (await textOf(field("file-name"))).trim() !== "");
  // Blazor: NotEqual(default, DateTimeOffset.Parse(…)) — a real date, not the epoch.
  await waitTrue(async () => {
    const lastModified = Date.parse(await textOf(field("file-last-modified")));
    return Number.isFinite(lastModified) && lastModified > 0;
  });
  await waitEqual(String(file.contents.length), () => textOf(field("file-size")));
  await waitEqual("text/plain", () => textOf(field("file-content-type")));
  await waitEqual(file.text, () => textOf(field("file-content")));
}

export const tests = [
  {
    // Blazor: CanUploadSingleSmallFile (:39)
    name: "CanUploadSingleSmallFile",
    run: withPage(async ({ page }, directory) => {
      // Create a temporary text file
      const file = tempFile(directory, "txt", "This file was uploaded to the browser and read from .NET.");

      // Upload the file
      await page.locator(byId("input-file")).setInputFiles(file.path);

      await assertUploaded(page, file);
    }),
  },
  {
    // Blazor: CanUploadSingleLargeFile (:64)
    name: "CanUploadSingleLargeFile",
    run: withPage(async ({ page }, directory) => {
      // Create a large text file
      const fileContentSizeInBytes = 1024 * 1024;
      let content = "";
      for (let i = 0; i < fileContentSizeInBytes; i++) content += String(i % 10);
      const file = tempFile(directory, "txt", content);

      // Upload the file
      await page.locator(byId("input-file")).setInputFiles(file.path);

      await assertUploaded(page, file);
    }),
  },
  {
    // Blazor: CanUploadMultipleFiles (:97)
    name: "CanUploadMultipleFiles",
    run: withPage(async ({ page }, directory) => {
      // Create multiple small text files
      const files = [1, 2, 3].map((i) => tempFile(directory, "txt", `Contents of file ${i}.`));

      // Upload each file
      await page.locator(byId("input-file")).setInputFiles(files.map((file) => file.path));

      // Validate that each file was uploaded correctly
      for (const file of files) await assertUploaded(page, file);
    }),
  },
  {
    // Blazor: CanUploadAndConvertImageFile (:128)
    name: "CanUploadAndConvertImageFile",
    run: withPage(async ({ page }, directory) => {
      const sourceImageId = "image-source";
      const imageStatus = await exists(page, byId("image-status"));
      await waitEqual("ready", () => textOf(imageStatus));

      // Get the source image base64
      const base64 = await page.evaluate((id) => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const image = document.getElementById(id);

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);

        return canvas.toDataURL().split(",").pop();
      }, sourceImageId);

      // Save the image file locally
      const file = tempFile(directory, "png", Buffer.from(base64, "base64"));

      // Re-upload the image file (it will be converted to a JPEG and scaled to fix 640x480)
      await page.locator(byId("input-image")).setInputFiles(file.path);

      // Validate that the image was converted without error and is the correct size
      const uploadedImage = await exists(page, byId("image-uploaded"));
      const size = () => uploadedImage.evaluate((image) => image.getBoundingClientRect());

      await waitEqual(480, async () => Math.round((await size()).width));
      await waitEqual(480, async () => Math.round((await size()).height));
    }),
  },
  {
    // Blazor: ThrowsWhenTooManyFilesAreSelected (:161)
    name: "ThrowsWhenTooManyFilesAreSelected",
    run: withPage(async ({ page }, directory) => {
      const maxAllowedFilesElement = await exists(page, byId("max-allowed-files"));
      await maxAllowedFilesElement.fill("1");
      await maxAllowedFilesElement.press("Enter");

      // Save two files locally
      const file1 = tempFile(directory, "txt", "This is file 1.");
      const file2 = tempFile(directory, "txt", "This is file 2.");

      // Select both files
      await page.locator(byId("input-file")).setInputFiles([file1.path, file2.path]);

      // Validate that the proper exception is thrown
      const exceptionMessage = await exists(page, byId("exception-message"));
      await waitEqual("The maximum number of files accepted is 1, but 2 were supplied.", () => textOf(exceptionMessage));
    }),
  },
  {
    // Blazor: ThrowsWhenOversizedFileIsSelected (:181)
    name: "ThrowsWhenOversizedFileIsSelected",
    skip:
      "Tsazor hands the app the browser's File, read with file.text() or arrayBuffer(); there is no " +
      "OpenReadStream(maxAllowedSize), whose cap guards Blazor's transfer of the bytes into .NET. A page that wants " +
      "a limit compares file.size itself (migration-practices.md).",
    run: async () => {},
  },
  {
    // Blazor: CanClearFilesByInvokingCancelEvent (:200)
    name: "CanClearFilesByInvokingCancelEvent",
    run: withPage(async ({ page }, directory) => {
      // Upload a file first
      const file = tempFile(directory, "txt", "This is a test file.");
      await page.locator(byId("input-file")).setInputFiles(file.path);

      // Verify the file was uploaded
      await exists(page, byId(`file-${file.name}`));

      // Get the file count element
      const fileCount = await exists(page, byId("file-count"));
      await waitEqual("1", () => textOf(fileCount));

      // Trigger the cancel event via JavaScript to simulate canceling the file dialog
      await page.evaluate(() => {
        const inputElement = document.getElementById("input-file");
        inputElement.dispatchEvent(new Event("cancel"));
      });

      // Wait a moment for the event to be processed and verify the file list was cleared
      await waitEqual("0", async () => textOf(await exists(page, byId("file-count"))));
    }),
  },
];
