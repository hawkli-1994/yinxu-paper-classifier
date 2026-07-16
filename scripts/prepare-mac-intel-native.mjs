import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const packageName = '@napi-rs/canvas-darwin-x64';
const packageVersion = '1.0.2';
const packageSpec = `${packageName}@${packageVersion}`;
const projectRoot = resolve(import.meta.dirname, '..');
const targetDirectory = join(projectRoot, 'node_modules', '@napi-rs', 'canvas-darwin-x64');
const bindingPath = join(targetDirectory, 'skia.darwin-x64.node');
const packageJsonPath = join(targetDirectory, 'package.json');

const isPrepared = () => {
  if (!existsSync(bindingPath) || !existsSync(packageJsonPath)) return false;
  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version === packageVersion;
  } catch {
    return false;
  }
};

const readTarString = (buffer, start, length) =>
  buffer.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '').trim();

const extractNpmTarball = async (archivePath) => {
  const archive = gunzipSync(await readFile(archivePath));
  const extractionRoot = resolve(targetDirectory);
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(readTarString(header, 124, 12) || '0', 8);
    const type = String.fromCharCode(header[156] || 0);
    const relativeName = normalize(fullName.replace(/^package\//, ''));
    const destination = resolve(extractionRoot, relativeName);
    const pathFromRoot = relative(extractionRoot, destination);
    if (relativeName && pathFromRoot && !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot)) {
      if (type === '5') {
        await mkdir(destination, { recursive: true });
      } else if (type === '0' || type === '\0') {
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, archive.subarray(offset + 512, offset + 512 + size));
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
};

if (isPrepared()) {
  console.log(`${packageSpec} is already prepared.`);
  process.exit(0);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yinxu-mac-intel-native-'));
try {
  await rm(targetDirectory, { recursive: true, force: true });
  await mkdir(targetDirectory, { recursive: true });
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packOutput = execFileSync(
    npmCommand,
    ['pack', packageSpec, '--json', '--pack-destination', temporaryDirectory],
    { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const [{ filename }] = JSON.parse(packOutput);
  await extractNpmTarball(join(temporaryDirectory, filename));
  if (!isPrepared()) throw new Error(`Failed to prepare ${packageSpec}.`);
  console.log(`Prepared ${packageSpec} for macOS Intel packaging.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
