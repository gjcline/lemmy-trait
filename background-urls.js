// Background image URLs - fully migrated to Netlify hosting
export const BACKGROUND_URLS = {
    '2 Face': 'https://trapstars-assets.netlify.app/background/2%20Face.png',
    '21 21': 'https://trapstars-assets.netlify.app/background/21%2021.png',
    '666': 'https://trapstars-assets.netlify.app/background/666.png',
    'Cave': 'https://trapstars-assets.netlify.app/background/Cave.png',
    'Christmas': 'https://trapstars-assets.netlify.app/background/Christmas.png',
    'Expensive': 'https://trapstars-assets.netlify.app/background/Expensive.png',
    'Flames': 'https://trapstars-assets.netlify.app/background/Flames.png',
    'Going Dark': 'https://trapstars-assets.netlify.app/background/Going%20Dark.png',
    'Grow House': 'https://trapstars-assets.netlify.app/background/Grow%20House.png',
    'Gucci': 'https://trapstars-assets.netlify.app/background/Gucci.png',
    'Lambo': 'https://trapstars-assets.netlify.app/background/Lambo.png',
    'Lights': 'https://trapstars-assets.netlify.app/background/Lights.png',
    'Locked Up': 'https://trapstars-assets.netlify.app/background/Locked%20Up.png',
    'Maduro': 'https://trapstars-assets.netlify.app/background/madurobg.png',
    'Mansion': 'https://trapstars-assets.netlify.app/background/Mansion.png',
    'Metal': 'https://trapstars-assets.netlify.app/background/Metal.png',
    'Moon': 'https://trapstars-assets.netlify.app/background/Moon.png',
    'Penthouse': 'https://trapstars-assets.netlify.app/background/Penthouse.png',
    'Pick Your Weapon': 'https://trapstars-assets.netlify.app/background/Pick%20Your%20Weapon.png',
    'Private Jet RR': 'https://trapstars-assets.netlify.app/background/Private%20Jet%20RR.png',
    'RR 1': 'https://trapstars-assets.netlify.app/background/RR%201.png',
    'RR Inside': 'https://trapstars-assets.netlify.app/background/RR%20Inside.png',
    'Scarface 2': 'https://trapstars-assets.netlify.app/background/scarface2.png',
    'Sega': 'https://trapstars-assets.netlify.app/background/Sega.png',
    'Studio': 'https://trapstars-assets.netlify.app/background/Studio.png',
    'Tony Montana': 'https://trapstars-assets.netlify.app/background/Tony%20Montana.png',
    'Trap 1': 'https://trapstars-assets.netlify.app/background/Trap%201.png',
    'Trap 2': 'https://trapstars-assets.netlify.app/background/Trap%202.png',
    'Up In Space': 'https://trapstars-assets.netlify.app/background/Up%20In%20Space.png',
    'Vapot': 'https://trapstars-assets.netlify.app/background/Vapot.png',
    'Views': 'https://trapstars-assets.netlify.app/background/Views.png'
};

export function getBackgroundUrl(backgroundName) {
    if (!backgroundName) return null;

    if (BACKGROUND_URLS[backgroundName]) {
        return BACKGROUND_URLS[backgroundName];
    }

    const lowerName = backgroundName.toLowerCase();
    for (const [key, url] of Object.entries(BACKGROUND_URLS)) {
        if (key.toLowerCase() === lowerName) {
            return url;
        }
    }

    return null;
}
