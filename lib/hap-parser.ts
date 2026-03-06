/**
 * HAP 包解析器
 * 参考 hap_parser.py 逻辑用 TypeScript 重写
 * HAP 本质是 ZIP 压缩包
 */

import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';

export interface TestLib {
  arch: string;
  /** 相对于 libs/{arch}/ 的路径，如 tests/qtbase/char/libtst_qatomicinteger_char.so */
  path: string;
  name: string;
  module: string;
}

const DEFAULT_ARCHS = ['arm64-v8a', 'armeabi-v7a', 'x86_64'];

/** 从 HAP 文件中解析出所有测试库列表 */
export async function parseHap(
  hapFilePath: string,
  architectures: string[] = DEFAULT_ARCHS
): Promise<TestLib[]> {
  const testLibs: TestLib[] = [];

  const directory = await unzipper.Open.file(hapFilePath);

  for (const arch of architectures) {
    // 筛选 libs/{arch}/tests/ 下的 libtst_*.so 文件
    const prefix = `libs/${arch}/`;
    const testsPrefix = `${prefix}tests/`;

    for (const file of directory.files) {
      const entryPath = file.path;
      if (
        entryPath.startsWith(testsPrefix) &&
        entryPath.endsWith('.so')
      ) {
        const fileName = path.basename(entryPath);
        if (!fileName.startsWith('libtst_')) { continue; }

        // 相对于 libs/{arch}/ 的路径
        const relativePath = entryPath.slice(prefix.length);

        // 提取模块名：tests/{module}/...
        const parts = relativePath.split('/');
        const moduleName =
          parts.length >= 2 && parts[0] === 'tests' ? parts[1] : 'unknown';

        testLibs.push({
          arch,
          path: relativePath,
          name: fileName,
          module: moduleName,
        });
      }
    }
  }

  return testLibs;
}

/** 从已解析的列表中提取所有模块名 */
export function getModules(testLibs: TestLib[]): string[] {
  const modules = new Set<string>();
  for (const lib of testLibs) {
    if (lib.module !== 'unknown') { modules.add(lib.module); }
  }
  return Array.from(modules).sort();
}

/** 过滤测试库 */
export function filterTestLibs(
  testLibs: TestLib[],
  filterArch?: string,
  filterModule?: string | string[],
  filterPattern?: string,
  ignoreModules?: string[]
): TestLib[] {
  let result = testLibs;
  if (filterArch) { result = result.filter((t) => t.arch === filterArch); }

  const modules = Array.isArray(filterModule)
    ? filterModule.filter(Boolean)
    : filterModule ? [filterModule] : [];

  if (modules.length > 0) {
    result = result.filter((t) => modules.some((m) => t.path.startsWith(`tests/${m}/`)));
  }

  if (ignoreModules && ignoreModules.length > 0) {
    result = result.filter((t) => {
      const nameNoSo = t.name.replace(/\.so$/, '');           // libtst_qchar
      const shortName = nameNoSo.replace(/^libtst_/, '');     // qchar
      return !ignoreModules.some(
        (entry) =>
          entry === t.path ||       // tests/qtbase/tst_qpluginloader/bin/libtst_xxx.so
          entry === t.module ||
          entry === t.name ||
          entry === nameNoSo ||
          entry === shortName
      );
    });
  }

  if (filterPattern) {
    result = result.filter((t) => t.name.includes(filterPattern));
  }
  return result;
}

/**
 * 从 HAP 包内读取 resources/resfile/gitignore 文件，
 * 返回要忽略的模块名列表（过滤掉注释行和空行）。
 * 若文件不存在则返回空数组。
 */
export async function readHapIgnoreList(hapFilePath: string): Promise<string[]> {
  try {
    const directory = await unzipper.Open.file(hapFilePath);
    const entry = directory.files.find(
      (f) => f.path === 'resources/resfile/gitignore'
    );
    if (!entry) return [];
    const buf = await entry.buffer();
    const text = buf.toString('utf-8');
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/** 保存上传的 HAP 文件到本地，返回保存路径 */
export async function saveHapFile(
  buffer: Buffer,
  fileName: string,
  uploadDir: string
): Promise<string> {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const savePath = path.join(uploadDir, fileName);
  fs.writeFileSync(savePath, buffer);
  return savePath;
}
