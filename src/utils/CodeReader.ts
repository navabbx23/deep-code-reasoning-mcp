import * as fs from 'fs/promises';
import * as path from 'path';
import type { CodeScope, CodeLocation } from '../models/types.js';
import { FileSystemError } from '../errors/index.js';

export class CodeReader {
  private cache: Map<string, string> = new Map();

  async readCodeFiles(scope: CodeScope): Promise<Map<string, string>> {
    const codeFiles = new Map<string, string>();

    // Read all files in scope
    for (const file of scope.files) {
      try {
        const content = await this.readFile(file);
        codeFiles.set(file, content);
      } catch (error) {
        console.error(`Failed to read file ${file}:`, error);
      }
    }

    // Read entry point files if specified
    if (scope.entryPoints) {
      for (const entryPoint of scope.entryPoints) {
        if (!codeFiles.has(entryPoint.file)) {
          try {
            const content = await this.readFile(entryPoint.file);
            codeFiles.set(entryPoint.file, content);
          } catch (error) {
            console.error(`Failed to read entry point ${entryPoint.file}:`, error);
          }
        }
      }
    }

    return codeFiles;
  }

  async readFile(filePath: string): Promise<string> {
    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      this.cache.set(filePath, content);
      return content;
    } catch (error) {
      if (error instanceof Error) {
        const code = (error as any).code || 'FS_ERROR';
        throw new FileSystemError(
          `Cannot read file ${filePath}: ${error.message}`,
          code,
          filePath,
          'read'
        );
      }
      throw error;
    }
  }

  async readCodeContext(location: CodeLocation, contextLineCount: number = 50): Promise<string> {
    const content = await this.readFile(location.file);
    const lines = content.split('\n');

    const startLine = Math.max(0, location.line - contextLineCount);
    const endLine = Math.min(lines.length, location.line + contextLineCount);

    const selectedLines = lines.slice(startLine, endLine);

    // Add line numbers for clarity
    return selectedLines.map((line: string, index: number) =>
      `${startLine + index + 1}: ${line}`,
    ).join('\n');
  }

  async findRelatedFiles(baseFile: string, patterns: string[] = []): Promise<string[]> {
    const relatedFiles: string[] = [];
    const dir = path.dirname(baseFile);
    const baseName = path.basename(baseFile, path.extname(baseFile));

    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);

        // Check if it's a related file (test, spec, impl, etc.)
        if (file.includes(baseName) ||
            file.includes(`${baseName}.test`) ||
            file.includes(`${baseName}.spec`) ||
            file.includes(`${baseName}Service`) ||
            file.includes(`${baseName}Controller`)) {
          relatedFiles.push(filePath);
        }

        // Check custom patterns
        for (const pattern of patterns) {
          if (file.includes(pattern)) {
            relatedFiles.push(filePath);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to find related files for ${baseFile}:`, error);
    }

    return relatedFiles;
  }

  clearCache() {
    this.cache.clear();
  }
}