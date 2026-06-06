# Project Guidelines

## Dependencies

This projects tries to use minimal dependencies. If something can be done with a few lines (~20) just implement it as a utility directly.
New dependencies need to be discussed with the user, explain why a dependency might be worth it.

## Testing

Test live in `test` and the folder structure must mirror the structure in `src`.
Run the test with `npm run test`.

## Typechecking (tsc, compiling)

You can use `npm run typecheck` to run the typescript compiler.

## Formatting & Linting

We are using biome to lint & format.
To just run biome run `npm run check:biome` to apply fixes automatically run `npm run check:biome:fix`

To simplfy typechecking the codebase run `npm run check` after code changes it automatically runs `check:biome` and `typecheck`.
Use this instead of indivudal npm run commands.
