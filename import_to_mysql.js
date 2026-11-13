const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

async function runAutoImport() {
    // 1. Konfigurasi Koneksi Database MySQL Namecheap
    // Sesuaikan host, user, password, dan nama database dari cPanel Anda
    const dbConfig = {
        host: 'localhost',
        user: 'andhvgfn',
        password: 'POrt!&)#82SERLI',
        database: 'keywords',
        waitForConnections: true,
        connectionLimit: 10
    };

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('[Info] Berhasil terhubung ke database MySQL Namecheap.');
    } catch (err) {
        console.error('[Error] Gagal terhubung ke database:', err.message);
        return;
    }

    // 2. Buat Tabel secara otomatis jika belum ada
    // (Menyesuaikan kolom dari CSV Anda: id, created_at, keyword, category, volume, difficulty, tags, content)
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS keywords (
            id INT PRIMARY KEY,
            created_at VARCHAR(100),
            keyword TEXT,
            category TEXT,
            volume INT,
            difficulty INT,
            tags TEXT,
            content TEXT
        );
    `;
    await connection.execute(createTableQuery);
    console.log('[Info] Tabel "keywords" siap digunakan.');

    // 3. Baca folder csv_konten
    const folderPath = path.join(__dirname, 'csv_konten');
    if (!fs.existsSync(folderPath)) {
        console.error(`[Error] Folder '${folderPath}' tidak ditemukan!`);
        await connection.end();
        return;
    }

    const files = fs.readdirSync(folderPath).filter(file => file.toLowerCase().endsWith('.csv'));
    console.log(`[Info] Ditemukan ${files.length} file CSV di dalam folder csv_konten.`);

    let totalInsertedRows = 0;

    // 4. Looping setiap file CSV
    for (const fileName of files) {
        const filePath = path.join(folderPath, fileName);
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let fileRowsCount = 0;

        for await (const line of rl) {
            if (!line.trim()) continue;

            // Parser baris CSV sederhana (mengatasi koma di dalam tanda kutip jika ada)
            const columns = parseCSVLine(line);

            // Pastikan jumlah kolom minimal mencukupi
            if (columns.length >= 8) {
                const [id, created_at, keyword, category, volume, difficulty, tags, content] = columns;

                const query = `
                    INSERT INTO keywords (id, created_at, keyword, category, volume, difficulty, tags, content) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    keyword = VALUES(keyword), category = VALUES(category);
                `;

                try {
                    await connection.execute(query, [
                        id ? parseInt(id) || 0 : 0,
                        created_at || null,
                        keyword || '',
                        category || '',
                        volume ? parseInt(volume) || 0 : 0,
                        difficulty ? parseInt(difficulty) || 0 : 0,
                        tags || '',
                        content || ''
                    ]);
                    fileRowsCount++;
                    totalInsertedRows++;
                } catch (dbErr) {
                    // Lewati baris yang duplikat primary key atau error syntax kecil agar proses tidak berhenti
                    console.warn(`[Warning] Gagal insert baris di file ${fileName}: ${dbErr.message}`);
                }
            }
        }
        console.log(`  -> Selesai memproses: ${fileName} (${fileRowsCount} baris masuk)`);
    }

    console.log('\n--- PROSES IMPORT SELESAI ---');
    console.log(`Total keseluruhan baris dimasukkan: ${totalInsertedRows}`);

    await connection.end();
}

// Helper untuk memecah baris CSV dengan aman dari koma di dalam string bertanda kutip
function parseCSVLine(text) {
    const result = [];
    let inQuotes = false;
    let current = '';
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^["']|["']$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
}

runAutoImport().catch(err => console.error('Terjadi kesalahan fatal:', err));