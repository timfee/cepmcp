# CEP Extension

This is a Gemini extension that provides tools for interacting with Google's Chrome Enterprise Premium (CEP) product offering.

## Development Conventions

This project uses TypeScript and the Model Context Protocol (MCP) SDK to create
a Gemini extension. The main entry point is `src/index.ts`, which initializes
the MCP server and registers the available tools.

The business logic for each service is separated into its own file in the
`src/services` directory. For example, `src/services/DocsService.ts` contains
the logic for interacting with the Google Docs API.

Authentication is handled by the `src/auth/AuthManager.ts` file, which uses the
`@google-cloud/local-auth` library to obtain and refresh OAuth 2.0 credentials.

## Adding New Tools

To add a new tool, you need to:

1.  Add a new method to the appropriate service file in `src/services`.
2.  In `src/index.ts`, register the new tool with the MCP server by calling
    `server.registerTool()`. You will need to provide a name for the tool, a
    description, and the input schema using the `zod` library.

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `npx ultracite fix`
- **Check for issues**: `npx ultracite check`
- **Diagnose setup**: `npx ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

## Documentation Standards (JSDoc/TSDoc)

All code must be documented to help new engineers understand the codebase. Follow these requirements strictly.

> **Note:** Oxlint validates JSDoc syntax but cannot enforce JSDoc presence (no `require-jsdoc` rule exists, and custom plugin comment APIs are not yet available). These standards are enforced through code review and AI agent instructions.

### File-Level Documentation

Every TypeScript file MUST begin with a file-level JSDoc comment describing its role:

```typescript
/**
 * Human-readable formatting utilities for Cloud Identity settings.
 */
```

### Function Documentation

Every exported function and class method MUST have a multi-line JSDoc comment:

```typescript
/**
 * Formats a Cloud Identity setting type into a human-readable name.
 */
export function formatSettingType(settingType: string) {
```

**Format requirements:**

- Use multi-line format with `/**` on its own line
- Description only - do NOT use `@param` or `@return` tags
- Keep descriptions concise but informative
- Explain the "why" not the "what" when the function name is self-explanatory

### Type and Interface Documentation

Every exported type, interface, and type alias MUST have a JSDoc comment:

```typescript
/**
 * Result from fetching Chrome audit events.
 */
export type ChromeEventsResult = { ... }

/**
 * Contract for CEP tool execution. Implementations include CepToolExecutor
 * for production API calls and FixtureToolExecutor for deterministic testing.
 */
export interface ToolExecutor { ... }
```

### What NOT to Document

- Private helper functions with obvious purpose (use judgment)
- Inline type definitions within function signatures

### Code Organization

- Two blank lines between top-level declarations (functions, classes, types)
- One blank line between substantially different blocks within a function
- Group related code together
- Do not re-export; do not clog code with backwards-compatability shims.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `npx ultracite fix` before committing to ensure compliance.
