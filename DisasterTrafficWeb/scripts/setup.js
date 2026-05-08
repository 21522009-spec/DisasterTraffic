#!/usr/bin/env node
/**
 * Setup script — chạy trên máy mới để đỡ phải gõ nhiều lệnh.
 *
 * Làm:
 *   1. Check Node version >= 18
 *   2. npm install nếu node_modules chưa có (hoặc người dùng truyền --force)
 *   3. Copy .env.example → .env nếu chưa có
 *   4. In ra checklist các giá trị cần fill vào .env
 *   5. Hỏi xem có muốn seed cameras luôn không
 *
 * Chạy:
 *   node scripts/setup.js
 *   hoặc
 *   npm run setup
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(msg, color = 'reset') {
    console.log(`${C[color] || ''}${msg}${C.reset}`);
}

function step(n, msg) {
    log(`\n${C.bold}${C.cyan}[${n}]${C.reset} ${msg}`);
}

function main() {
    log(`${C.bold}DisasterTrafficWeb - Setup${C.reset}`);
    log(`Working dir: ${ROOT}`, 'dim');

    // Node version
    step(1, 'Kiểm tra Node.js version');
    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    if (nodeMajor < 18) {
        log(`Node ${process.versions.node} quá cũ. Cần >= 18.`, 'red');
        log(`  Tải tại https://nodejs.org/ (chọn LTS)`, 'dim');
        process.exit(1);
    }
    log(`Node ${process.versions.node} OK`, 'green');

    // Cài deps
    step(2, 'Cài dependencies');
    const nodeModulesPath = join(ROOT, 'node_modules');
    const force = process.argv.includes('--force');

    if (!existsSync(nodeModulesPath) || force) {
        log('  Đang chạy npm install...', 'dim');
        const res = spawnSync('npm', ['install'], {
            cwd: ROOT,
            stdio: 'inherit',
            shell: true,
        });
        if (res.status !== 0) {
            log('npm install lỗi.', 'red');
            process.exit(1);
        }
        log('npm install xong', 'green');
    } else {
        log(`node_modules đã có (chạy với --force để cài lại)`, 'green');
    }

    // .env
    step(3, 'Setup file .env');
    const envPath = join(ROOT, '.env');
    const envExamplePath = join(ROOT, '.env.example');

    if (!existsSync(envExamplePath)) {
        log('Không tìm thấy .env.example', 'red');
        process.exit(1);
    }

    if (!existsSync(envPath)) {
        copyFileSync(envExamplePath, envPath);
        log('Đã copy .env.example -> .env', 'green');
    } else {
        log('.env đã tồn tại (giữ nguyên)', 'green');
    }

    // Checklist biến
    step(4, 'Checklist các biến cần điền vào .env');
    const envContent = readFileSync(envPath, 'utf-8');

    const checks = [
        { key: 'MONGO_URI', required: true, hint: 'Connection string MongoDB Atlas' },
        { key: 'TOMTOM_KEY', required: false, hint: 'TomTom API key cho traffic layer (optional)' },
        { key: 'AI_WEBHOOK_SECRET', required: true, hint: 'Chuỗi random dài, AI service dùng để post alert' },
    ];

    let allOK = true;
    for (const c of checks) {
        const re = new RegExp(`^${c.key}=(.+)$`, 'm');
        const m = envContent.match(re);
        const value = m ? m[1].trim() : '';
        const isPlaceholder =
            !value ||
            value.includes('replace_me') ||
            value.includes('USER:PASSWORD') ||
            value === 'secret_key';

        if (c.required && isPlaceholder) {
            log(`  [missing] ${c.key}: chưa được set hoặc còn placeholder. ${C.dim}(${c.hint})${C.reset}`, 'yellow');
            allOK = false;
        } else if (isPlaceholder) {
            log(`  [skip] ${c.key}: chưa set (optional). ${C.dim}(${c.hint})${C.reset}`, 'dim');
        } else {
            log(`  [ok]   ${c.key}`, 'green');
        }
    }

    if (!allOK) {
        log(`\n${C.yellow}Vui lòng mở file .env và điền các giá trị còn thiếu trước khi chạy server.${C.reset}`);
    }

    step(5, 'Thêm camera');
    log('  Camera được quản lý qua Admin Panel sau khi server khởi động:', 'dim');
    log(`  -> ${C.cyan}http://localhost:3000/admin.html${C.reset}  (yêu cầu tài khoản Enterprise)`);
    log('  Hoặc dùng script seed cho môi trường dev:', 'dim');
    log(`  -> ${C.cyan}npm run seed:cameras${C.reset}  (chỉ dùng khi dev, KHÔNG chạy trên production)`);

    log(`\n${C.bold}${C.green}Setup xong.${C.reset}`);
    log(`\nBước tiếp theo:`);
    log(`  1. Mở file ${C.cyan}.env${C.reset} điền các giá trị còn thiếu`);
    log(`  2. Chạy server: ${C.cyan}npm run dev${C.reset}`);
    log(`  3. Test: ${C.cyan}curl http://localhost:3000/api/health${C.reset}`);
    log(`  4. Mở web: ${C.cyan}http://localhost:3000${C.reset}`);
}

main().catch((err) => {
    log(`Setup lỗi: ${err.message}`, 'red');
    process.exit(1);
});
