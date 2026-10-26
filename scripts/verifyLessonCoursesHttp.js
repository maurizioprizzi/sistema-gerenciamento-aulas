'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const { startServer } = require('../src/server');
const { DatabaseConnection } = require('../src/config/database');
const { User } = require('../src/models/User');
const { Course } = require('../src/models/Course');
const { Lesson } = require('../src/models/Lesson');
const { LessonService } = require('../src/services/LessonService');

/**
 * Execute: node scripts/verifyLessonCoursesHttp.js
 *
 * Verifica servidor, índices, primeiro cadastro, login e operações HTTP de
 * cursos e aulas com MongoDB local real. O frontend é substituído por um
 * middleware neutro: esta verificação não avalia a interface visual.
 *
 * Não lê o .env: usa diretório vazio, configuração fictícia e banco temporário
 * em 127.0.0.1:27017. A conexão força autoIndex=false para conferir a preparação
 * explícita dos índices. A condição de concorrência é provocada no adaptador
 * de escrita do serviço, usando documentos reais e a atualização do MongoDB.
 *
 * Ao terminar normalmente ou em caso de falha, encerra o HTTP, remove somente
 * o banco temporário gerado aqui e restaura as variáveis do processo.
 */
const DATABASE_PREFIX = 'lesson_courses_http_check_';
const TOKEN = randomBytes(32).toString('hex');
const PASSWORD = 'senha-ficticia-http-de-teste';
const logger = { info() {}, error() {}, log() {} };

function availablePort() {
    return new Promise((resolve, reject) => {
        const probe = http.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const port = probe.address().port;
            probe.close(error => error ? reject(error) : resolve(port));
        });
    });
}

async function main() {
    const dbName = `${DATABASE_PREFIX}${randomBytes(8).toString('hex')}`;
    const uri = `mongodb://127.0.0.1:27017/${dbName}`;
    const originalDirectory = process.cwd();
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lesson-courses-http-'));
    const originals = new Map();
    const originalSignals = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, new Set(process.listeners(signal))]));
    const database = new DatabaseConnection({ mongooseClient: mongoose, logger });
    let server;
    let connected = false;
    let scenarios = 0;
    let currentScenario = 'inicialização';
    const connectDatabase = database.connect.bind(database);
    database.connect = async (address, options = {}) => {
        const connection = await connectDatabase(address, { ...options, autoIndex: false });
        connected = true;
        return connection;
    };

    function passed(description) {
        scenarios += 1;
        console.info(`OK ${scenarios}: ${description}`);
    }
    function setEnvironment(values) {
        for (const [key, value] of Object.entries(values)) {
            if (!originals.has(key)) originals.set(key, process.env[key]);
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
    function removeTestSignalHandlers() {
        for (const [signal, originalHandlers] of originalSignals) {
            for (const handler of process.listeners(signal)) {
                if (!originalHandlers.has(handler)) process.removeListener(signal, handler);
            }
        }
    }
    async function stopHttp() {
        if (server) {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            server = null;
        }
        removeTestSignalHandlers();
    }
    async function launch() {
        server = await startServer({
            database,
            logger,
            frontendAssetsMiddlewareFactory: () => (_request, _response, next) => next(),
        });
        connected = true;
    }
    function request(route, { method = 'GET', body, headers = {} } = {}) {
        return new Promise((resolve, reject) => {
            const text = body === undefined ? '' : JSON.stringify(body);
            const outgoing = http.request({
                host: '127.0.0.1', port: server.address().port, path: route, method,
                agent: false,
                headers: { ...(text ? { 'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(text) } : {}), ...headers },
            }, response => {
                let data = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { data += chunk; });
                response.on('error', reject);
                response.on('end', () => {
                    try { resolve({ status: response.statusCode, headers: response.headers,
                        body: data ? JSON.parse(data) : null }); }
                    catch (error) { reject(error); }
                });
            });
            outgoing.setTimeout(15000, () => outgoing.destroy(new Error('Tempo HTTP excedido.')));
            outgoing.on('error', reject);
            outgoing.end(text);
        });
    }

    try {
        process.chdir(temporaryDirectory);
        const port = await availablePort();
        const origin = `http://127.0.0.1:${port}`;
        setEnvironment({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
            MONGODB_URI: uri, SESSION_SECRET: randomBytes(48).toString('hex'),
            PASSWORD_HASH_ROUNDS: '10', SESSION_HOURS: '1', APP_ORIGIN: origin,
            TRUST_PROXY: '0', INITIAL_SETUP_TOKEN: TOKEN,
            ADMIN_NAME: undefined, ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined });
        await launch();

        currentScenario = 'índices explícitos com autoIndex desativado';
        assert.equal(mongoose.connection.config.autoIndex, false);
        const indexes = await Lesson.collection.indexes();
        const linkIndex = indexes.find(index => index.name === 'lessons_course_id_date');
        assert.ok(linkIndex);
        assert.deepEqual(linkIndex.key, { courseId: 1, date: 1 });
        assert.notEqual(linkIndex.unique, true);
        assert.equal(await Course.countDocuments({}), 0);
        assert.equal(await Lesson.countDocuments({}), 0);
        passed('servidor confirma índice por curso e data com autoIndex desativado');

        currentScenario = 'autorização antes das operações de aulas';
        const nonexistentId = new mongoose.Types.ObjectId().toString();
        for (const [method, route] of [
            ['GET', '/api/lessons'], ['POST', '/api/lessons'],
            ['PUT', `/api/lessons/${nonexistentId}`], ['DELETE', `/api/lessons/${nonexistentId}`],
        ]) {
            assert.equal((await request(route, { method })).status, 401);
        }
        assert.equal(await Lesson.countDocuments({}), 0);
        passed('consulta e gravações sem sessão são recusadas antes de acessar os dados');

        currentScenario = 'primeiro cadastro e login reais';
        const createdAdmin = await request('/api/setup/admin', {
            method: 'POST', headers: { Origin: origin },
            body: { invitationToken: TOKEN, name: 'Ana Silva',
                email: 'ana@example.com', password: PASSWORD },
        });
        assert.equal(createdAdmin.status, 201);
        const login = await request('/api/auth/login', {
            method: 'POST', body: { email: 'ana@example.com', password: PASSWORD },
        });
        assert.equal(login.status, 200);
        assert.equal(await User.countDocuments({ role: 'admin' }), 1);
        const cookies = login.headers['set-cookie'];
        assert.ok(Array.isArray(cookies) && cookies.length > 0);
        const cookie = cookies.map(value => value.split(';')[0]).join('; ');
        const headers = { Cookie: cookie };
        const authenticated = (route, options = {}) => request(route, {
            ...options, headers: { ...headers, ...options.headers },
        });
        passed('conta fictícia criada por convite permite login com sessão persistente');

        currentScenario = 'cadastro de cursos personalizados';
        async function createCourse(name, code) {
            const result = await authenticated('/api/courses', {
                method: 'POST', body: { name, code },
            });
            assert.equal(result.status, 201);
            return result.body.data.course;
        }
        const courseA = await createCourse('Ciência de Dados', 'CD');
        const courseB = await createCourse('Redes de Computadores', 'RC');
        assert.notEqual(courseA.id, courseB.id);
        passed('dois cursos personalizados são criados com identidades independentes');

        const lessonData = {
            date: '2026-10-25', courseId: courseA.id, curricularUnit: 'Introdução aos Dados',
            type: 'Aula', lessonNumber: '1', needsReview: false,
            lessonPlanUrl: null, studentGuideUrl: null,
        };
        currentScenario = 'recusas antes da gravação';
        for (const [body, status, code] of [
            [{ ...lessonData, courseId: nonexistentId }, 404, 'LESSON_COURSE_NOT_FOUND'],
            [{ ...lessonData, courseId: 'SIGLA' }, 400, 'INVALID_LESSON_DATA'],
            [{ ...lessonData, course: 'CD' }, 400, 'INVALID_LESSON_DATA'],
        ]) {
            const result = await authenticated('/api/lessons', { method: 'POST', body });
            assert.equal(result.status, status);
            assert.equal(result.body.error.code, code);
        }
        assert.equal(await Lesson.countDocuments({}), 0);
        passed('curso ausente, identificador malformado e sigla extra não gravam aulas');

        currentScenario = 'criação e consulta por identidade';
        const createdLessons = [];
        for (const lessonNumber of ['1', '2']) {
            const result = await authenticated('/api/lessons', {
                method: 'POST', body: { ...lessonData, lessonNumber },
            });
            assert.equal(result.status, 201);
            assert.equal(result.body.data.lesson.courseId, courseA.id);
            assert.equal(result.body.data.lesson.course, 'CD');
            createdLessons.push(result.body.data.lesson);
        }
        const [first, second] = createdLessons;
        let listed = await authenticated(`/api/lessons?courseId=${courseA.id}&month=2026-10`);
        assert.equal(listed.status, 200);
        assert.equal(listed.body.data.lessons.length, 2);
        for (const raw of await Lesson.find({}).lean()) {
            assert.equal(raw.courseId.toString(), courseA.id);
            assert.equal(Object.hasOwn(raw, 'course'), false);
        }
        const ambiguous = await authenticated(`/api/lessons?courseId=${courseA.id}&course=APQSA`);
        assert.equal(ambiguous.status, 400);
        assert.equal(ambiguous.body.error.code, 'INVALID_LESSON_FILTERS');
        passed('aulas guardam somente o vínculo por ID e são consultadas pelo curso e mês');

        currentScenario = 'renomeação sem alterar o vínculo';
        const renamed = await authenticated(`/api/courses/${courseA.id}`, {
            method: 'PUT', body: { name: 'Análise de Dados', code: 'AD' },
        });
        assert.equal(renamed.status, 200);
        assert.equal(renamed.body.data.course.id, courseA.id);
        listed = await authenticated(`/api/lessons?courseId=${courseA.id}`);
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.data.lessons.map(lesson => lesson.course), ['AD', 'AD']);
        assert.deepEqual(new Set(listed.body.data.lessons.map(lesson => lesson.id)),
            new Set(createdLessons.map(lesson => lesson.id)));
        passed('editar nome e sigla atualiza a apresentação sem trocar a identidade das aulas');

        currentScenario = 'desativação e preservação do histórico';
        const deactivated = await authenticated(`/api/courses/${courseA.id}/deactivate`, { method: 'PATCH' });
        assert.equal(deactivated.status, 200);
        assert.equal(deactivated.body.data.course.active, false);
        listed = await authenticated(`/api/lessons?courseId=${courseA.id}`);
        assert.equal(listed.status, 200);
        assert.equal(listed.body.data.lessons.length, 2);
        const refusedCreation = await authenticated('/api/lessons', { method: 'POST', body: lessonData });
        assert.equal(refusedCreation.status, 409);
        assert.equal(refusedCreation.body.error.code, 'LESSON_COURSE_INACTIVE');
        assert.equal(await Lesson.countDocuments({}), 2);
        passed('desativação mantém o histórico e impede novas aulas naquele curso');

        currentScenario = 'edição mantendo curso desativado';
        const edited = await authenticated(`/api/lessons/${first.id}`, {
            method: 'PUT', body: { ...lessonData, curricularUnit: 'Unidade revisada' },
        });
        assert.equal(edited.status, 200);
        assert.equal(edited.body.data.lesson.courseId, courseA.id);
        assert.equal(edited.body.data.lesson.course, 'AD');
        assert.equal(edited.body.data.lesson.curricularUnit, 'Unidade revisada');
        assert.equal((await Course.findById(courseA.id).lean()).active, false);
        passed('edição permite manter o curso desativado sem reativá-lo ou remover o vínculo');

        currentScenario = 'troca para curso desativado';
        const thirdResult = await authenticated('/api/lessons', {
            method: 'POST', body: { ...lessonData, courseId: courseB.id },
        });
        assert.equal(thirdResult.status, 201);
        const third = thirdResult.body.data.lesson;
        const refusedUpdate = await authenticated(`/api/lessons/${third.id}`, {
            method: 'PUT', body: lessonData,
        });
        assert.equal(refusedUpdate.status, 409);
        assert.equal(refusedUpdate.body.error.code, 'LESSON_COURSE_INACTIVE');
        assert.equal((await Lesson.findById(third.id).lean()).courseId.toString(), courseB.id);
        passed('outra aula não pode ser transferida para um curso desativado');

        currentScenario = 'troca para curso ativo';
        const moved = await authenticated(`/api/lessons/${first.id}`, {
            method: 'PUT', body: { ...lessonData, courseId: courseB.id },
        });
        assert.equal(moved.status, 200);
        assert.equal(moved.body.data.lesson.id, first.id);
        assert.equal(moved.body.data.lesson.courseId, courseB.id);
        assert.equal(moved.body.data.lesson.course, 'RC');
        assert.equal(Object.hasOwn(await Lesson.findById(first.id).lean(), 'course'), false);
        passed('troca para curso ativo preserva a identidade da aula sem armazenar sigla antiga');

        currentScenario = 'troca concorrente do vínculo';
        // O adaptador provoca a outra escrita após a leitura do serviço e antes
        // de sua atualização condicional. As duas escritas usam MongoDB real.
        const concurrentModel = {
            create: Lesson.create.bind(Lesson), find: Lesson.find.bind(Lesson),
            findById: Lesson.findById.bind(Lesson),
            findByIdAndUpdate: Lesson.findByIdAndUpdate.bind(Lesson),
            findByIdAndDelete: Lesson.findByIdAndDelete.bind(Lesson),
            async findOneAndUpdate(filter, update, options) {
                await Lesson.updateOne({ _id: second.id }, {
                    $set: { courseId: courseB.id, curricularUnit: 'Edição concorrente' },
                });
                return Lesson.findOneAndUpdate(filter, update, options);
            },
        };
        const service = new LessonService({ LessonModel: concurrentModel, CourseModel: Course });
        await assert.rejects(service.updateLesson(second.id, lessonData),
            { code: 'LESSON_CHANGED', statusCode: 409 });
        const concurrent = await Lesson.findById(second.id).lean();
        assert.equal(concurrent.courseId.toString(), courseB.id);
        assert.equal(concurrent.curricularUnit, 'Edição concorrente');
        passed('atualização condicional recusa vínculo concorrente e preserva a outra edição');

        currentScenario = 'persistência após nova inicialização';
        const savedIds = (await Lesson.find({}).lean()).map(lesson => lesson._id.toString()).sort();
        await stopHttp();
        await database.disconnect();
        setEnvironment({ INITIAL_SETUP_TOKEN: undefined });
        await launch();
        listed = await authenticated('/api/lessons');
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.data.lessons.map(lesson => lesson.id).sort(), savedIds);
        assert.ok(listed.body.data.lessons.every(lesson => lesson.courseId === courseB.id && lesson.course === 'RC'));
        passed('nova inicialização preserva aulas, cursos, vínculos e sessão sem novo convite');

        currentScenario = 'exclusão da aula e encerramento da sessão';
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const removed = await authenticated(`/api/lessons/${third.id}`, { method: 'DELETE' });
            assert.equal(removed.status, 204);
            assert.equal(removed.body, null);
        }
        assert.equal(await Lesson.countDocuments({}), 2);
        assert.equal(await Course.countDocuments({}), 2);
        assert.equal((await authenticated('/api/auth/logout', { method: 'POST' })).status, 204);
        assert.equal((await authenticated('/api/lessons')).status, 401);
        passed('exclusão idempotente preserva cursos e logout encerra o acesso às aulas');
    } catch (error) {
        console.error(`Falha no cenário: ${currentScenario}.`);
        throw error;
    } finally {
        const cleanupErrors = [];
        try { await stopHttp(); } catch (error) { cleanupErrors.push(error); }
        try {
            if (connected || mongoose.connection.readyState === 1) {
                // Uma falha de startServer pode ter fechado a conexão. Nesse
                // caso, reconecta somente à URI temporária conhecida para limpeza.
                if (mongoose.connection.readyState !== 1) {
                    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
                }
                assert.equal(mongoose.connection.name, dbName);
                assert.ok(dbName.startsWith(DATABASE_PREFIX));
                await mongoose.connection.db.dropDatabase();
                console.info(`Banco temporário removido: ${dbName}`);
            }
        } catch (error) { cleanupErrors.push(error); }
        finally {
            try { await database.disconnect(); } catch (error) { cleanupErrors.push(error); }
            for (const [key, value] of originals) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            process.chdir(originalDirectory);
            try { await fs.rm(temporaryDirectory, { recursive: true, force: true }); }
            catch (error) { cleanupErrors.push(error); }
        }
        if (cleanupErrors.length) {
            throw new AggregateError(cleanupErrors, 'A limpeza da verificação HTTP não foi concluída.');
        }
    }
    console.info(`Verificação concluída: ${scenarios} cenários aprovados.`);
}

main().catch(error => {
    console.error('Verificação interrompida.', { errorName: error.name, message: error.message });
    process.exitCode = 1;
});
