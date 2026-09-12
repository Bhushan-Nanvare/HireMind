import { execSync } from "child_process";

/**
 * Runs once before the suite: makes sure DATABASE_URL points at a throwaway test database and that its
 * schema is up to date. The tests truncate tables as they go, so never aim this at real data.
 */
export default function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Point it at a test database, e.g.\n" +
        "  docker run --rm -d --name hiremind-test-db -e POSTGRES_USER=hiremind -e POSTGRES_PASSWORD=hiremind_test -e POSTGRES_DB=hiremind_test -p 55432:5432 postgres:16"
    );
  }

  const database = url.split("/").pop()?.split("?")[0] ?? "";
  if (!/test/i.test(database)) {
    throw new Error(`Refusing to run tests against the database "${database}": its name must contain "test".`);
  }

  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
