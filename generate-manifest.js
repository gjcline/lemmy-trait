#!/usr/bin/env node

/**
 * Helper script to generate manifest.json from trait files
 * 
 * Usage:
 *   1. Put all your trait PNG files in public/traits/{category}/ folders
 *   2. Run: node generate-manifest.js
 *   3. It will create/update public/traits/manifest.json
 * 
 * This reads the actual files in your folders and creates the manifest automatically.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRAITS_DIR = path.join(__dirname, 'public', 'traits');
const MANIFEST_PATH = path.join(TRAITS_DIR, 'manifest.json');

// Get layer order from config.json
let layerOrder = [];
try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    layerOrder = config.layerOrder || [];
    console.log('✅ Loaded layer order from config.json');
} catch (err) {
    console.warn('⚠️ Could not load config.json, will scan all folders');
}

// Function to get all PNG files in a directory
function getTraitFiles(categoryDir) {
    if (!fs.existsSync(categoryDir)) {
        return [];
    }
    
    const files = fs.readdirSync(categoryDir);
    return files
        .filter(file => file.toLowerCase().endsWith('.png'))
        .map(file => file.replace(/\.png$/i, '')); // Remove .png extension
}

// Generate manifest
console.log('📁 Scanning trait folders...');

const manifest = {};
const categories = layerOrder.length > 0 ? layerOrder : [];

// If we have layer order, use it; otherwise scan for folders
if (categories.length > 0) {
    categories.forEach(category => {
        const categoryDir = path.join(TRAITS_DIR, category);
        const traits = getTraitFiles(categoryDir);
        manifest[category] = traits.sort(); // Sort alphabetically
        console.log(`  ${category}: ${traits.length} traits`);
    });
} else {
    // Scan for all folders
    if (fs.existsSync(TRAITS_DIR)) {
        const folders = fs.readdirSync(TRAITS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        folders.forEach(category => {
            const categoryDir = path.join(TRAITS_DIR, category);
            const traits = getTraitFiles(categoryDir);
            manifest[category] = traits.sort();
            console.log(`  ${category}: ${traits.length} traits`);
        });
    }
}

// Write manifest
const manifestJson = JSON.stringify(manifest, null, 2);
fs.writeFileSync(MANIFEST_PATH, manifestJson, 'utf8');

console.log(`\n✅ Generated manifest.json with ${Object.keys(manifest).length} categories`);
console.log(`   Total traits: ${Object.values(manifest).flat().length}`);
console.log(`   Saved to: ${MANIFEST_PATH}\n`);

// Show summary
Object.entries(manifest).forEach(([category, traits]) => {
    if (traits.length > 0) {
        console.log(`   ${category}: ${traits.length} traits`);
    }
});

