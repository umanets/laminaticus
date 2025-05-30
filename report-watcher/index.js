#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { parseStringPromise } = require('xml2js');
const { Pool } = require('pg');

// Initialize Postgres pool (configure via PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'laminaticus',
  password: process.env.PGPASSWORD || 'laminaticus_pass',
  database: process.env.PGDATABASE || 'laminaticus',
});

const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  console.error(`Data directory not found: ${dataDir}`);
  process.exit(1);
}

const xmlFile = path.join(dataDir, 'report.xml');
// const jsonFile = path.join(dataDir, 'report.json'); // no longer writing JSON file
// Mappings file for tag to category/brand
const mappingsFile = path.join(dataDir, 'mappings.json');

async function transformXmlToJson() {
  try {
    const data = await fs.promises.readFile(xmlFile, 'utf8');
    // Parse XML to JS object without arrays for single entries
    let result = await parseStringPromise(data, { explicitArray: false });
    // Trim all string values in the object
    function trimAll(obj) {
      if (typeof obj === 'string') {
        return obj.trim();
      } else if (Array.isArray(obj)) {
        return obj.map(trimAll);
      } else if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          obj[key] = trimAll(obj[key]);
        }
      }
      return obj;
    }
    result = trimAll(result);
    // Load or initialize mappings.json
    let mappings = { keyMappings: {} };
    if (fs.existsSync(mappingsFile)) {
      try {
        const mData = await fs.promises.readFile(mappingsFile, 'utf8');
        mappings = JSON.parse(mData);
      } catch (err) {
        console.error(`Error reading mappings file: ${err}. Initializing new mappings.`);
      }
    } else {
      await fs.promises.writeFile(mappingsFile, JSON.stringify(mappings, null, 2), 'utf8');
    }
    // Filter products whose tag matches <category>_<brand> pattern and extract category and brand
    console.log('Filtering products by tag pattern <category>_<brand>');
    if (result.tg && result.tg.products && result.tg.products.product) {
      let items = result.tg.products.product;
      if (!Array.isArray(items)) items = [items];
      result.tg.products.product = items.reduce((acc, item) => {
        const match = /^([^_]+)_([^_]+)$/.exec(item.tag);
        if (match) {
          const [, category, brand] = match;
          item.category = category;
          item.brand = brand;
          // Update mappings if new tag
          if (!mappings.keyMappings[item.tag]) {
            mappings.keyMappings[item.tag] = { Catalog: category, Brands: brand };
          }
          acc.push(item);
        }
        return acc;
      }, []);
      // Save updated mappings
      try {
        await fs.promises.writeFile(mappingsFile, JSON.stringify(mappings, null, 2), 'utf8');
        console.log(`Updated mappings file: ${mappingsFile}`);
      } catch (err) {
        console.error(`Error writing mappings file: ${err}`);
      }
    }
    // Prepare output: only the array of product items
    let outputProducts = [];
    if (result.tg && result.tg.products && result.tg.products.product) {
      outputProducts = result.tg.products.product;
    }
    // Write transformed data into Postgres
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE reports');
        const insertText = `
          INSERT INTO reports
            (id, tag, name, article, quantity, unit, category, brand, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
        `;
        for (const item of outputProducts) {
          await client.query(insertText, [
            parseInt(item.id, 10),
            item.tag,
            item.name,
            item.article,
            parseFloat(item.quantity),
            item.unit,
            item.category,
            item.brand
          ]);
        }
        await client.query('COMMIT');
        console.log(`Upserted ${outputProducts.length} records into Postgres 'reports' table.`);
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error('DB transaction error:', dbErr);
      } finally {
        client.release();
      }
    } catch (connErr) {
      console.error('Postgres connection error:', connErr);
    }
  } catch (err) {
    console.error(`Error during transformation: ${err}`);
  }
}

console.log(`Watching for creation or modification of ${xmlFile}`);
const watcher = chokidar.watch(xmlFile, { persistent: true, ignoreInitial: true });
watcher
  .on('add', transformXmlToJson)
  .on('change', transformXmlToJson)
  .on('error', (error) => console.error(`Watcher error: ${error}`));