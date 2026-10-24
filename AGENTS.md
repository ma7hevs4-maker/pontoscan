# Project rules
- Keep Campus export table policies, pagination and photo signing in a server-safe helper with behavioral tests so schema-specific ordering, batching and expiry stay consistent.
- Import privileged database clients inside authenticated route handlers, never at route module scope, to keep them out of the client bundle.