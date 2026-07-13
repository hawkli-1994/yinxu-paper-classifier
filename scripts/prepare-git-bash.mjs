import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const version = '2.55.0.2';
const archiveName = `Git-${version}-64-bit.tar.bz2`;
const archiveUrl = `https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.2/${archiveName}`;
const archiveSha256 = '5cfd35fadb11ac2f629c16f7be262f3f138cfe3f368331ad1e44f9abb5814882';
const projectRoot = resolve(import.meta.dirname, '..');
const resourcesRoot = join(projectRoot, 'resources');
const targetRoot = join(resourcesRoot, 'git-bash');
const cacheRoot = join(projectRoot, 'node_modules', '.cache', 'yinxu-runtime');
const cachedArchive = join(cacheRoot, archiveName);

const executables = [
  'bash.exe', 'sh.exe', 'ls.exe', 'find.exe', 'grep.exe', 'cat.exe', 'sed.exe', 'sort.exe', 'head.exe', 'tail.exe',
  'wc.exe', 'tr.exe', 'cut.exe', 'xargs.exe', 'dirname.exe', 'basename.exe', 'pwd.exe', 'mkdir.exe', 'cp.exe', 'mv.exe',
  'rm.exe', 'test.exe', 'env.exe', 'printf.exe', 'readlink.exe', 'realpath.exe', 'stat.exe', 'touch.exe', 'date.exe',
  'sleep.exe', 'echo.exe', 'uniq.exe', 'tee.exe', 'diff.exe', 'comm.exe', 'which.exe', 'expr.exe', 'cygpath.exe',
  'true.exe', 'false.exe', 'seq.exe', 'sha256sum.exe'
];
const runtimeLibraries = [
  'msys-2.0.dll', 'msys-gcc_s-seh-1.dll', 'msys-gmp-10.dll', 'msys-iconv-2.dll', 'msys-intl-8.dll', 'msys-pcre-1.dll'
];
const archivePaths = [...executables, ...runtimeLibraries].map((name) => `usr/bin/${name}`);
const requiredPaths = ['VERSION', ...archivePaths];

const sha256 = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};

const isPrepared = async () => {
  try {
    if ((await readFile(join(targetRoot, 'VERSION'), 'utf8')).trim() !== version) return false;
    await Promise.all(requiredPaths.slice(1).map((path) => access(join(targetRoot, path))));
    return (await stat(join(targetRoot, 'usr', 'bin', 'bash.exe'))).size > 1_000_000;
  } catch {
    return false;
  }
};

const downloadArchive = async (destination) => {
  const response = await fetch(archiveUrl, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Git Bash 下载失败：HTTP ${response.status}`);
  const temporaryPath = `${destination}.${randomUUID()}.tmp`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
    if (await sha256(temporaryPath) !== archiveSha256) throw new Error('Git Bash 发行包校验失败。');
    await rm(destination, { force: true });
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }
};

if (await isPrepared()) {
  console.log(`Git Bash ${version} runtime is already prepared.`);
  process.exit(0);
}

await mkdir(cacheRoot, { recursive: true });
const archiveOverride = process.env.YINXU_GIT_BASH_ARCHIVE;
const archivePath = archiveOverride ? resolve(archiveOverride) : cachedArchive;
if (!existsSync(archivePath) || await sha256(archivePath) !== archiveSha256) {
  if (archiveOverride) throw new Error('YINXU_GIT_BASH_ARCHIVE 指向的文件校验失败。');
  await downloadArchive(cachedArchive);
}

const stagingRoot = join(resourcesRoot, `.git-bash-${randomUUID()}`);
try {
  await mkdir(stagingRoot, { recursive: true });
  const extraction = spawnSync('tar', ['-xjf', archivePath, '-C', stagingRoot, ...archivePaths], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  if (extraction.status !== 0) throw new Error(`无法提取 Git Bash 运行时：${extraction.stderr || extraction.stdout}`);
  await writeFile(join(stagingRoot, 'VERSION'), `${version}\n`, 'utf8');
  await writeFile(
    join(stagingRoot, 'NOTICE.txt'),
    `Git for Windows runtime subset ${version}\nSource: ${archiveUrl}\nProject and license information: https://gitforwindows.org/ and https://github.com/git-for-windows/git\n`,
    'utf8'
  );
  await rm(targetRoot, { recursive: true, force: true });
  await rename(stagingRoot, targetRoot);
  if (!(await isPrepared())) throw new Error('Git Bash 运行时文件不完整。');
  console.log(`Prepared private Git Bash ${version} runtime (${executables.length} commands).`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
