#!/usr/bin/env node

import * as path from "node:path";
import * as fs from "node:fs";

import prompts from "prompts";
import { spawn } from "node:child_process";
import chalk from "chalk";
import ora from "ora";

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
      // .gitkeep 제외, 디렉토리 생성 로그 출력
      if (path.basename(src) === ".gitkeep") {
        console.log(`${chalk.green("CREATE")} ${dest.split(".gitkeep")[0]}`);
        return;
      }
      fs.copyFileSync(src, dest);
      console.log(`${chalk.green("CREATE")} ${dest}`);
    }
  };

  const write = (file: string) => {
    const src = path.join(templateRoot, file);
    const dest = path.join(targetRoot, file);
    copy(src, dest);
  };

  // 1. Copy all files except package.json
  const files = fs.readdirSync(templateRoot);
  for (const file of files.filter((f) => f !== "package.json")) {
    write(file);
  }

  // 2. Copy package.json and modify name
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

  // 3. Set up Yarn Berry
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
      "yarn dlx @yarnpkg/sdks vscode",
    ];

    for await (const c of commands) {
      const [command, ...args] = c.split(" ");
      const child = spawn(command, args, { cwd: apiRoot });
      const spinner = ora(`Running ${command} ${args.join(" ")}`).start();

      child.on("error", (error) => {
        spinner.fail();
        console.error(`❌ Error: ${command}`);
        console.error(error);
        throw error;
      });

      await new Promise((resolve) => {
        child.on("close", () => {
          spinner.succeed();
          resolve("");
        });
      });
    }
    console.log(`\nYarn Berry has been set up in ${apiRoot}\n`);
  } else {
    console.log(`\nTo set up Yarn Berry, run the following commands:\n`);
    console.log(chalk.gray(`  $ cd ${targetDir}/api`));
    console.log(chalk.gray(`  $ yarn set version berry`));
    console.log(chalk.gray(`  $ yarn install`));
    console.log(chalk.gray(`  $ yarn dlx @yarnpkg/sdks vscode\n`));
  }

  // 4. Set up Database using Docker
  const { isDatabase } = await prompts({
    type: "confirm",
    name: "isDatabase",
    message: "Would you like to set up a database using Docker?",
    initial: false,
  });

  if (isDatabase) {
    console.log(`\nSetting up a database using Docker...`);

    // 프롬프트로 입력 받아서 MYSQL_CONTAINER_NAME, MYSQL_DATABASE, DB_PASSWORD .env 파일에 추가
    const answers = await promptDatabase(targetDir);
    const env = `# Database
DB_HOST=0.0.0.0
DB_USER=root
DB_PASSWORD=${answers.DB_PASSWORD}
DOCKER_PROJECT_NAME=${answers.DOCKER_PROJECT_NAME}
MYSQL_CONTAINER_NAME="${answers.MYSQL_CONTAINER_NAME}"
MYSQL_DATABASE=${answers.MYSQL_DATABASE}
`;
    fs.writeFileSync(path.join(targetRoot, "api", ".env"), env);

    // docker-compose 실행
    const databaseRoot = path.join(targetRoot, "api", "database");
    const envFile = path.join(targetRoot, "api", ".env");
    const commands = [`docker-compose --env-file ${envFile} up -d`];

    for await (const c of commands) {
      const [command, ...args] = c.split(" ");
      const child = spawn(command, args, { cwd: databaseRoot });
      const spinner = ora(`Running ${command} ${args.join(" ")}`).start();

      child.on("error", (error) => {
        spinner.fail();
        console.error(`❌ Error: ${command}`);
        console.error(error);
        throw error;
      });

      await new Promise((resolve) => {
        child.on("close", () => {
          spinner.succeed();
          resolve("");
        });
      });
    }
    console.log(`\nA database has been set up in ${databaseRoot}\n`);
  } else {
    console.log(
      `\nTo set up a database using Docker, run the following commands:\n`,
    );
    console.log(chalk.gray(`  $ cd ${targetDir}/api/database`));
    console.log(chalk.gray(`  $ docker-compose -p ${targetDir} up -d`));
    console.log(`\nOr use your preferred database management tool.`);
  }
}

// 프롬프트로 MYSQL_CONTAINER_NAME, MYSQL_DATABASE, DB_PASSWORD 입력받는 함수
async function promptDatabase(projectName: string) {
  const answers = await prompts([
    {
      type: "text",
      name: "DOCKER_PROJECT_NAME",
      message: "Enter the Docker project name:",
      initial: `${projectName}`,
    },
    {
      type: "text",
      name: "MYSQL_CONTAINER_NAME",
      message: "Enter the MySQL container name:",
      initial: "mysql",
    },
    {
      type: "text",
      name: "MYSQL_DATABASE",
      message: "Enter the MySQL database name:",
      initial: `${projectName}`,
    },
    {
      type: "password",
      name: "DB_PASSWORD",
      message: "Enter the MySQL database password:",
    },
  ]);

  return answers;
}

init().catch((e) => {
  console.error(e);
});
