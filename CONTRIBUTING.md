# Contributing to Trion Engine

Thanks for contributing to Trion. Please understand the existing ECS, graphics boundary and ownership model before proposing a new system or asset feature.

## Setup

```bash
git clone <your-fork-url>
cd "Trion Engine"
npm install
npm run dev
```

Run a production check before opening a pull request:

```bash
npm run build
```

## Workflow

1. Fork the repository and create a focused branch.
2. Inspect the relevant code and existing public API.
3. Make the smallest change that satisfies the goal.
4. Run `npm run build` and any relevant runtime checks.
5. Commit a clear, focused change.
6. Open a pull request describing behavior, ownership implications and verification.

## Code and architecture expectations

- Keep `Scene` as the owner of entities.
- Keep components as data; do not embed Three.js resource ownership in ECS components.
- Keep Three.js-specific behavior in `src/engine/graphics/`.
- Keep physics-specific behavior in `src/engine/physics/`.
- Keep DOM-specific UI behavior in `src/engine/systems/UISystem.ts`; keep UI components pure data in `src/engine/components/ui/`.
- Respect resource ownership: AssetManager owns registered geometries/materials, Renderer owns rendering infrastructure, PhysicsSystem owns physics world state, UISystem owns DOM lifecycle, and systems borrow resources.
- Prefer simple APIs and explicit control flow over new managers, registries or abstractions without a demonstrated need.
- Do not mix unrelated cleanup or refactors into feature work.
- Preserve public APIs unless a breaking change is explicitly discussed.

## Testing

At minimum, run `npm run build`. Add a focused runtime smoke test when practical, especially for lifecycle, asset ownership or rendering-boundary changes. Document any browser-only validation that cannot be automated locally.

## Pull requests

Keep commits and pull requests narrow. Include:

- The problem being solved.
- The public API or behavior changed.
- Resource ownership and disposal consequences, if applicable.
- Test/build results.
- Known limitations or follow-up work.

Avoid speculative abstractions. New systems should fit the current Engine → Scene → Entity/Component → System model rather than bypassing it.
