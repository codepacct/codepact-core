import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

test("packed tarball includes every tracked source, binary, and metadata file", () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "codepact-npm-cache-"))
	try {
		const tracked = execFileSync("git", ["ls-files", "-z", "src", "bin"], {
			cwd: root,
			encoding: "utf8",
		})
			.split("\0")
			.filter(Boolean)
			.sort()
		assert.ok(tracked.length > 0, "expected tracked files under src/ and bin/")

		const packResult = spawnSync(npmCommand, ["pack", "--dry-run", "--json"], {
			cwd: root,
			encoding: "utf8",
			shell: process.platform === "win32",
			env: { ...process.env, npm_config_cache: cacheDir },
		})
		assert.equal(packResult.status, 0, packResult.stderr)

		const packMetadata = JSON.parse(packResult.stdout)
		assert.equal(packMetadata.length, 1)
		const packedPaths = new Set(packMetadata[0].files.map((entry) => entry.path))

		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
		const expectedRequired = ["package.json", "README.md", "LICENSE", ...tracked]
		if (typeof pkg.main === "string") expectedRequired.push(pkg.main.replace(/^\.\//, ""))

		const missing = expectedRequired.filter((file) => !packedPaths.has(file))
		assert.deepEqual(missing, [], `Files missing from packed tarball: ${missing.join(", ")}`)
	} finally {
		rmSync(cacheDir, { recursive: true, force: true })
	}
})
