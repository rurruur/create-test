#!/usr/bin/env zx

// zx를 전역으로 사용하기 위한 import
import { $, fs } from "zx";

console.log("🔨 Building project...");
await $`yarn build`;

console.log("📦 Reading package.json...");
const { version } = JSON.parse(await fs.readFile("./package.json", "utf8"));

console.log(`🏷️  Creating tag v${version}...`);
try {
  await $`git tag -a v${version} -m "Release v${version}"`;
  console.log(`✅ Tag v${version} created successfully`);
} catch (error) {
  console.log(`⚠️  Tag v${version} already exists or failed to create`);
}

console.log("🚀 Pushing tags to remote...");
try {
  await $`git push --follow-tags`;
  console.log("✅ Tags pushed successfully");
} catch (error) {
  console.log("⚠️  Failed to push tags:", error.message);
}
