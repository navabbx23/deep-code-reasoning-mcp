# Contributing to Deep Code Reasoning MCP

First off, thank you for considering contributing to Deep Code Reasoning MCP! It's people like you that make this tool better for everyone.

## Code of Conduct

By participating in this project, you are expected to uphold our principles:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Your environment (OS, Node.js version, etc.)
- Any relevant logs or error messages

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- A clear and descriptive title
- A detailed description of the proposed functionality
- Any possible drawbacks or considerations
- If possible, a rough implementation approach

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure the test suite passes (`npm test`)
4. Make sure your code lints (`npm run lint`)
5. Ensure TypeScript types are correct (`npm run typecheck`)
6. Update documentation as needed
7. Issue that pull request!

## Development Setup

1. Fork and clone the repository:
```bash
git clone https://github.com/your-username/deep-code-reasoning-mcp.git
cd deep-code-reasoning-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment:
```bash
cp .env.example .env
# Add your GEMINI_API_KEY to .env
```

4. Run in development mode:
```bash
npm run dev
```

## Project Structure

```
deep-code-reasoning-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── analyzers/         # Core analysis implementations
│   ├── models/            # TypeScript types
│   ├── services/          # External service integrations
│   └── utils/             # Utility functions
├── examples/              # Example code for testing
└── tests/                 # Test files
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Provide comprehensive type definitions
- Avoid `any` types unless absolutely necessary
- Use interfaces for object shapes

### Code Style

- Follow the existing code style
- Use meaningful variable and function names
- Comment complex logic
- Keep functions focused and small

### Commits

- Use clear and meaningful commit messages
- Reference issues and pull requests when relevant
- Keep commits atomic (one feature/fix per commit)

Example commit messages:
```
feat: add support for analyzing Python codebases
fix: handle edge case in N+1 query detection
docs: update installation instructions for Windows
test: add tests for cross-system impact analysis
```

### Testing

- Write tests for new functionality
- Ensure existing tests pass
- Aim for good test coverage
- Test edge cases and error conditions

## Adding New Analysis Tools

To add a new analysis tool:

1. Create a new analyzer in `src/analyzers/`
2. Define the tool schema in `src/index.ts`
3. Add the tool handler in the `CallToolRequestSchema` handler
4. Update the README with documentation
5. Add tests for the new functionality
6. Create an example in `examples/`

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments to exported functions
- Include examples for new features
- Keep documentation concise but comprehensive

## Review Process

1. All submissions require review
2. Changes may be requested for clarity or consistency
3. Be patient - reviews may take time
4. Address feedback constructively

## Recognition

Contributors will be recognized in:
- The project's contributor list
- Release notes for significant contributions
- Special mentions for exceptional contributions

## Questions?

Feel free to open an issue with the `question` label or reach out to the maintainers.

Thank you for contributing to Deep Code Reasoning MCP!