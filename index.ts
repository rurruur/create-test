#!/usr/bin/env node

import * as path from "node:path";
import * as fs from "node:fs";

import prompts from "prompts";
import { spawn } from "node:child_process";
import ProgressBar from "progress";

async function init() {
  const defaultProjectName = "pp1";

  let result: prompts.Answers<"targetDir">;
  try {
    result = await prompts(
      [
        {
          type: "text",
          name: "targetDir",
          message: "Project name:",
          initial: defaultProjectName,
        },
      ],
      {
        onCancel: () => {
          throw new Error("Operation cancelled.");
        },
      },
    );
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  let { targetDir } = result;

  const targetRoot = path.join(process.cwd(), targetDir);
  const templateRoot = new URL("./template", import.meta.url).pathname;

  const copy = (src: string, dest: string) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const file of fs.readdirSync(src)) {
        const srcFile = path.resolve(src, file);
        const destFile = path.resolve(dest, file);
        copy(srcFile, destFile);
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  };

  const write = (file: string) => {
    const src = path.join(templateRoot, file);
    const dest = path.join(targetRoot, file);
    copy(src, dest);
  };

  const files = fs.readdirSync(templateRoot);
  for (const file of files.filter((f) => f !== "package.json")) {
    write(file);
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateRoot, "api", "package.json"), "utf-8"),
  );
  pkg.name = targetDir === "." ? path.basename(path.resolve()) : targetDir;
  fs.writeFileSync(
    path.join(targetRoot, "api", "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );

  fs.mkdirSync(path.join(targetRoot, "web", "src", "services"), {
    recursive: true,
  });

  console.log(`\n🌲 Created project in ${targetRoot}\n`);

  const { isBerry } = await prompts({
    type: "confirm",
    name: "isBerry",
    message: "Would you like to set up Yarn Berry?",
    initial: false,
  });

  if (isBerry) {
    console.log(`\nSetting up Yarn Berry...`);
    const apiRoot = path.join(targetRoot, "api");
    const commands = [
      "yarn set version berry",
      "yarn install",
      "yarn @yarnpkg/sdks vscode",
    ];

    for await (const command of commands) {
      const child = spawn("yarn", command.split(" ").splice(1), {
        cwd: apiRoot,
      });
      const bar = new ProgressBar(`${command} [:bar] :percent :etas`, {
        complete: "=",
        incomplete: " ",
        width: 40,
        total: child.stdout.readableLength,
      });

      child.stdout.pipe(process.stdout);
      child.stdout.on("data", (data) => {
        bar.tick(data.length);
      });
      child.on("error", (error) => {
        console.error(`❌ Error: ${command}`);
        console.error(error);
        throw error;
      });

      await new Promise((resolve) => {
        child.on("close", () => {
          resolve("");
        });
      });
    }
    console.log(`\n🌲 Yarn Berry has been set up in ${apiRoot}\n`);
  } else {
    console.log(`\nTo set up Yarn Berry, run the following commands:`);
    console.log(`  cd ${targetDir}/api`);
    console.log(`  yarn set version berry`);
    console.log(`  yarn install`);
    console.log(`  yarn dlx @yarnpkg/sdks vscode`);
  }
}

init().catch((e) => {
  console.error(e);
});
