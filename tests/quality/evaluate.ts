import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './cases.schema.json';
import { evaluateQuality, type QualityEvaluationCase } from '../../src/shared/quality-evaluator';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('用法：npm run evaluate:quality -- <gold-set.json>');
const input = JSON.parse(await readFile(inputPath, 'utf8')) as { cases?: QualityEvaluationCase[] };
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
if (!validate(input)) throw new Error(`黄金集格式无效：${JSON.stringify(validate.errors)}`);
const metrics = evaluateQuality(input.cases ?? []);
process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
