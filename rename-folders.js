#!/usr/bin/env node

/**
 * Script to rename trait folders to match config.json (lowercase)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRAITS_DIR = path.join(__dirname, 'public', 'traits');

// Mapping from common capitalized names to config.json names
const folderMapping = {
    'Background': 'background',
    'Body': 'body',
    'Shirt': 'shirt',
    'Accessories': 'accessories',
    'Logo': 'logo',
    'Meme': 'meme',
    'Iceout Chain': 'iceout chain',
    'Face': 'face',
    'Eyes': 'eyes',
    'Eyebrows': 'eyebrows',
    'Hair': 'hair',
    'Mouth': 'mouth',
    'Weapons': 'weapons',
    'Eyewear': 'eyewear',
    'Headwear': 'headwear'
};

console.log('🔄 Renaming trait folders to match config.json...\n');

if (!fs.existsSync(TRAITS_DIR)) {
    console.error('❌ public/traits folder not found!');
    console.log('   Make sure you\'ve copied your trait folders to public/traits/ first.');
    process.exit(1);
}

const folders = fs.readdirSync(TRAITS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

if (folders.length === 0) {
    console.error('❌ No folders found in public/traits/');
    console.log('   Please copy your trait folders to public/traits/ first.');
    process.exit(1);
}

console.log(`Found ${folders.length} folders to check:\n`);

let renamed = 0;
let skipped = 0;
let errors = 0;

folders.forEach(oldName => {
    // Try to find matching lowercase name
    let newName = folderMapping[oldName];
    
    // If not in mapping, try lowercase
    if (!newName) {
        newName = oldName.toLowerCase();
    }
    
    if (oldName === newName) {
        console.log(`✓ ${oldName} (already correct)`);
        skipped++;
        return;
    }
    
    const oldPath = path.join(TRAITS_DIR, oldName);
    const newPath = path.join(TRAITS_DIR, newName);
    
    // Check if target already exists
    if (fs.existsSync(newPath)) {
        console.log(`⚠ ${oldName} → ${newName} (target exists, skipping)`);
        skipped++;
        return;
    }
    
    try {
        fs.renameSync(oldPath, newPath);
        console.log(`✓ ${oldName} → ${newName}`);
        renamed++;
    } catch (err) {
        console.error(`❌ Failed to rename ${oldName}: ${err.message}`);
        errors++;
    }
});

console.log(`\n✅ Done! Renamed ${renamed} folders, ${skipped} skipped, ${errors} errors.`);

if (renamed > 0) {
    console.log('\n💡 Next step: Run "node generate-manifest.js" to create the manifest file.');
}

