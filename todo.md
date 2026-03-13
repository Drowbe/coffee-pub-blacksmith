# TODO

- Decide how Curator should handle asset defaults that currently point into Blacksmith paths. Confirm whether those assets should stay shared, be duplicated into Curator, or be redirected through a Blacksmith-provided asset API/constant layer.
- Migrate the neutral chat-card theme from internal `default` / `theme-default` naming to `tan` / `theme-tan` for consistency with the other color themes. This needs a deliberate migration plan because saved world settings, existing templates/selectors, and dependent Coffee Pub modules may still rely on the current IDs/classes.
