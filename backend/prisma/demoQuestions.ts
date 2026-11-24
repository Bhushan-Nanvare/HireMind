export interface DemoQuestion {
  text: string;
  options: string[];
  correct: number[];
  topic: string;
}

export const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    topic: "Node.js",
    text: "Which statement about the Node.js event loop is correct?",
    options: [
      "Every request gets its own operating-system thread",
      "JavaScript runs on one thread while I/O is handed off so it doesn't block",
      "The event loop is only used for timers",
      "Callbacks run in parallel on every CPU core",
    ],
    correct: [1],
  },
  {
    topic: "Node.js",
    text: "What does process.nextTick() do?",
    options: [
      "Runs the callback before the event loop moves on to its next phase",
      "Schedules the callback after every timer has fired",
      "Runs the callback in a worker thread",
      "Delays the callback by one second",
    ],
    correct: [0],
  },
  {
    topic: "Node.js",
    text: "What is the usual way to handle an error from an awaited call in an async function?",
    options: [
      "Call process.exit() on every error",
      "Errors in async functions are ignored by default",
      "Wrap the call in try/catch, or handle the rejected promise",
      "Add a .catch() to the function declaration",
    ],
    correct: [2],
  },
  {
    topic: "Node.js",
    text: "Which built-in module lets you run CPU-heavy JavaScript without blocking the main thread?",
    options: ["fs", "path", "events", "worker_threads"],
    correct: [3],
  },
  {
    topic: "Node.js",
    text: "In Express, what does calling next(err) do?",
    options: [
      "Restarts the server",
      "Passes the error on to the error-handling middleware",
      "Sends a 500 response without running any more middleware",
      "Logs the error and carries on to the next normal route",
    ],
    correct: [1],
  },
  {
    topic: "Node.js",
    text: "How does npm ci differ from npm install?",
    options: [
      "It installs exactly what package-lock.json says, and fails if that doesn't match package.json",
      "It upgrades every dependency to the latest version",
      "It installs only devDependencies",
      "It ignores the lockfile and resolves fresh versions",
    ],
    correct: [0],
  },
  {
    topic: "Node.js",
    text: "Which of these are built into Node.js? (select all that apply)",
    options: ["http", "express", "crypto", "lodash"],
    correct: [0, 2],
  },
  {
    topic: "Node.js",
    text: "What is the risk of calling JSON.parse on untrusted input without handling errors?",
    options: [
      "It silently corrupts memory",
      "It always returns null on bad input",
      "It sends the data on to the client",
      "It throws on invalid JSON, which can fail the request or crash the process if uncaught",
    ],
    correct: [3],
  },
  {
    topic: "Node.js",
    text: "What happens to Promise.all when one of its promises rejects?",
    options: [
      "It waits for the rest and then resolves",
      "It rejects straight away with that reason",
      "It ignores the rejected promise",
      "It retries the rejected promise once",
    ],
    correct: [1],
  },
  {
    topic: "Node.js",
    text: "Why shouldn't a JWT signing key be committed to git?",
    options: [
      "Git can't store strings that long",
      "It slows down cloning",
      "Anyone who can read the repository, including its history, can read the key",
      "Node.js doesn't support environment variables",
    ],
    correct: [2],
  },
  {
    topic: "PostgreSQL",
    text: "What does an index on a column mainly speed up?",
    options: [
      "Inserts into the table",
      "Lookups, joins and sorts that use that column",
      "Dropping the table",
      "Every possible query on the table",
    ],
    correct: [1],
  },
  {
    topic: "PostgreSQL",
    text: "What does EXPLAIN ANALYZE show?",
    options: [
      "The query plan together with actual run times and row counts",
      "The SQL text after formatting",
      "The list of indexes in the database",
      "Who ran the query",
    ],
    correct: [0],
  },
  {
    topic: "PostgreSQL",
    text: "Two transactions read the same row and then each write back an update based on what they read, so one overwrites the other. What is this called?",
    options: ["A dirty read", "A phantom index", "A deadlock timeout", "A lost update"],
    correct: [3],
  },
  {
    topic: "PostgreSQL",
    text: "What does a foreign key with ON DELETE CASCADE do?",
    options: [
      "Stops the parent row from ever being deleted",
      "Deletes the child rows when their parent row is deleted",
      "Copies the child rows to another table",
      "Ignores the foreign key on delete",
    ],
    correct: [1],
  },
  {
    topic: "PostgreSQL",
    text: "What is the N+1 query problem?",
    options: [
      "Running one query for a list and then one more per row of that list",
      "Joining N tables in a single query",
      "Having N+1 indexes on a table",
      "Using N+1 connections in a pool",
    ],
    correct: [0],
  },
  {
    topic: "PostgreSQL",
    text: "Which of these can speed up a slow query? (select all that apply)",
    options: [
      "Adding a suitable index",
      "Selecting only the columns you need",
      "Adding SELECT * everywhere",
      "Replacing a correlated subquery with a join where possible",
    ],
    correct: [0, 1, 3],
  },
  {
    topic: "PostgreSQL",
    text: "What is the safest way to build a query from user input?",
    options: [
      "Concatenate the input and escape quotes by hand",
      "Strip all spaces from the input",
      "Run the query twice and compare the results",
      "Use parameterised queries",
    ],
    correct: [3],
  },
  {
    topic: "PostgreSQL",
    text: "Which statement about a UNIQUE constraint is true?",
    options: [
      "It makes the column NOT NULL automatically",
      "It stops two rows having the same value in the constrained column or columns",
      "It can only be used on primary keys",
      "It is enforced only by the application",
    ],
    correct: [1],
  },
  {
    topic: "PostgreSQL",
    text: "What does VACUUM do in PostgreSQL?",
    options: [
      "Deletes every row in a table",
      "Encrypts the table",
      "Reclaims space held by dead rows left behind by updates and deletes",
      "Rebuilds every foreign key",
    ],
    correct: [2],
  },
  {
    topic: "PostgreSQL",
    text: "Why wrap related writes in a transaction?",
    options: [
      "So they either all succeed or none do",
      "So they run faster",
      "So other users can't read the table",
      "So the data is encrypted at rest",
    ],
    correct: [0],
  },
  {
    topic: "APIs",
    text: "Which HTTP status code means the client isn't authenticated?",
    options: ["403", "404", "401", "409"],
    correct: [2],
  },
  {
    topic: "APIs",
    text: "What makes an operation idempotent?",
    options: [
      "It can only ever be run once",
      "Repeating it has the same effect as doing it once",
      "It always returns 200",
      "It never touches the database",
    ],
    correct: [1],
  },
  {
    topic: "APIs",
    text: "Why put a timeout on calls to another service?",
    options: [
      "So responses are cached",
      "So errors are hidden",
      "To make the dependency faster",
      "So one slow dependency can't tie up your requests indefinitely",
    ],
    correct: [3],
  },
  {
    topic: "APIs",
    text: "What does retrying with exponential backoff help you avoid?",
    options: [
      "Hammering a struggling service with immediate repeat requests",
      "Needing authentication",
      "Missing database indexes",
      "CORS errors",
    ],
    correct: [0],
  },
  {
    topic: "APIs",
    text: "Which response header lets a browser app on a different origin call your API?",
    options: ["Content-Length", "Access-Control-Allow-Origin", "Cache-Control: no-store", "X-Powered-By"],
    correct: [1],
  },
  {
    topic: "APIs",
    text: "A user asks for a record that belongs to someone else. What should the API return so it doesn't reveal the record exists?",
    options: ["200 with an empty body", "500 Internal Server Error", "404 Not Found", "302 redirect to login"],
    correct: [2],
  },
  {
    topic: "APIs",
    text: "What is the main purpose of rate limiting?",
    options: [
      "To make responses smaller",
      "To encrypt traffic",
      "To protect the service from overload and abuse",
      "To cache database queries",
    ],
    correct: [2],
  },
  {
    topic: "APIs",
    text: "Which are good practice for passwords? (select all that apply)",
    options: [
      "Hash them with a slow, salted algorithm such as bcrypt or argon2",
      "Store them in plain text so support can recover them",
      "Never write them to logs",
      "Use a fast hash such as MD5 so logins are quick",
    ],
    correct: [0, 2],
  },
  {
    topic: "APIs",
    text: "What does a health-check endpoint let a hosting platform do?",
    options: [
      "Authenticate users",
      "Cache static assets",
      "Run database migrations",
      "Tell whether the service is up, and route traffic or restart it",
    ],
    correct: [3],
  },
  {
    topic: "APIs",
    text: "What is the benefit of structured JSON logs over plain text?",
    options: [
      "They use no disk space",
      "They can be searched and filtered by field in a log tool",
      "They are encrypted",
      "They remove the need for monitoring",
    ],
    correct: [1],
  },
];
