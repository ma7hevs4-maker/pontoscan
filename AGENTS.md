# Project rules
- Keep Campus export pagination in a server-safe helper with behavioral tests so batching and limits stay consistent across exported tables.
- Import privileged database clients inside authenticated route handlers, never at route module scope, to keep them out of the client bundle.