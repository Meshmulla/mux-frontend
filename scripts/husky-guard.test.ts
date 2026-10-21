import { execSync } from "child_process";
import * as fs from "fs";
import { readFileSync } from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HuskyPreCommitGuard } from "./husky-guard";

vi.mock("child_process", () => {
	const execSync = vi.fn();
	return { default: { execSync }, execSync };
});

const REPORT_PATH = ".husky/_guard-report.json";
const tempDirs: string[] = [];

function tempReportPath(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "husky-guard-"));
	tempDirs.push(dir);
	return path.join(dir, "guard-report.json");
}

describe("HuskyPreCommitGuard", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.mocked(execSync).mockReset();
		if (fs.existsSync(REPORT_PATH)) {
			fs.rmSync(REPORT_PATH);
		}
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("lists the un-run checks as skipped when failFast stops the run early", async () => {
		vi.mocked(execSync).mockImplementation(() => {
			throw new Error("lint failed");
		});

		const guard = new HuskyPreCommitGuard({
			checks: ["lint", "typecheck", "test", "security"],
			failFast: true,
			reportPath: REPORT_PATH,
		});

		await guard.runGuard();

		const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
		expect(report.summary.skipped).toEqual(["typecheck", "test", "security"]);
		expect(report.summary.total).toBe(1);
		expect(report.summary.failed).toBe(1);
		expect(report.passed).toBe(false);
	});

	it("does not write a report file when preCommit is disabled", async () => {
		const reportPath = tempReportPath();
		const guard = new HuskyPreCommitGuard({
			enabled: false,
			reportPath,
		});

		expect(await guard.preCommit()).toBe(true);
		expect(execSync).not.toHaveBeenCalled();
		expect(fs.existsSync(reportPath)).toBe(false);
	});

	it("writes enabled and blocking settings for an enabled guard", async () => {
		const reportPath = tempReportPath();
		const guard = new HuskyPreCommitGuard({
			enabled: true,
			blockOnFailures: false,
			checks: [],
			reportPath,
		});

		expect(await guard.preCommit()).toBe(true);

		const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
		expect(report).toMatchObject({
			enabled: true,
			blockOnFailures: false,
			passed: true,
		});
	});

	it("sets the report's passed flag to false when any executed check failed", async () => {
		vi.mocked(execSync).mockImplementation((command: string) => {
			if (command.includes("eslint")) {
				throw new Error("lint failed");
			}
			return Buffer.from("");
		});

		const guard = new HuskyPreCommitGuard({
			checks: ["lint", "typecheck"],
			failFast: false,
			reportPath: REPORT_PATH,
		});

		await guard.runGuard();

		const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
		expect(report.passed).toBe(false);
		expect(report.summary.skipped).toEqual([]);
	});

	it("runs the vitest command for the test check", async () => {
		const guard = new HuskyPreCommitGuard({
			checks: ["test"],
			failFast: false,
		});
		const [result] = await guard.runGuard();

		expect(execSync).toHaveBeenCalledWith("npx vitest run", expect.anything());
		expect(result.passed).toBe(true);
	});

	it("runs the eslint command for the lint check", async () => {
		const guard = new HuskyPreCommitGuard({
			checks: ["lint"],
			failFast: false,
		});
		await guard.runGuard();

		expect(execSync).toHaveBeenCalledWith(
			"npx eslint --max-warnings 0",
			expect.anything(),
		);
	});

	it("runs the tsc command for the typecheck check", async () => {
		const guard = new HuskyPreCommitGuard({
			checks: ["typecheck"],
			failFast: false,
		});
		await guard.runGuard();

		expect(execSync).toHaveBeenCalledWith(
			"npx tsc --noEmit",
			expect.anything(),
		);
	});

	it("fails closed on an unknown check without invoking execSync", async () => {
		const guard = new HuskyPreCommitGuard({
			checks: ["some-unknown-check"],
			failFast: false,
		});
		const [result] = await guard.runGuard();

		expect(execSync).not.toHaveBeenCalled();
		expect(result.passed).toBe(false);
		expect(result.errors[0]).toContain("Unsupported pre-commit check");
	});

	it("never shells out to jest or audit-ci, which are not repo dependencies", () => {
		const source = readFileSync(
			path.join(process.cwd(), "scripts/husky-guard.ts"),
			"utf8",
		);

		expect(source).not.toContain("jest");
		expect(source).not.toContain("audit-ci");
	});
});
