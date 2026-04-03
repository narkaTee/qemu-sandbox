# Project Guidelines

## Dependencies

This projects tries to use minimal dependencies. If something can be done with a few lines (~20) just implement it as a utility directly.
New dependencies need to be discussed with the user, explain why a dependency might be worth it.

## Testing

Test live in `test` and the folder structure must mirror the structure in `src`.
Run the test with `npm run test`.

## Typechecking (tsc, compiling)

Run `npm run typecheck` after every code change and fix any errors before considering the task done.

## Formatting

Run `npm run fmt` after every code change to format with Prettier.
