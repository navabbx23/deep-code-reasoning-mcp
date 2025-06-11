# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Deep Code Reasoning MCP Server
- Integration with Google's Gemini AI for deep code analysis
- Five core analysis tools:
  - `escalate_analysis` - Hand off complex analysis from Claude Code to Gemini
  - `trace_execution_path` - Deep execution analysis with semantic understanding
  - `hypothesis_test` - Test specific theories about code behavior
  - `cross_system_impact` - Analyze changes across service boundaries
  - `performance_bottleneck` - Deep performance analysis with execution modeling
- Support for analyzing TypeScript and JavaScript codebases
- Comprehensive documentation and examples
- MIT License
- GitHub Actions CI/CD pipeline
- ESLint configuration for code quality

### Security
- Environment variable support for secure API key management
- No code is stored permanently - analysis is performed in-memory

## [0.1.0] - 2025-01-10

### Added
- Initial project setup and core functionality

[Unreleased]: https://github.com/Haasonsaas/deep-code-reasoning-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Haasonsaas/deep-code-reasoning-mcp/releases/tag/v0.1.0