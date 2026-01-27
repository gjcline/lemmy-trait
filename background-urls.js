// Background image URLs - migrated to Netlify hosting
export const BACKGROUND_URLS = {
    '2 Face': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774713/2_Face_d67nki.png', // TODO: Find correct Netlify URL
    '21 21': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774725/21_21_cwiymn.png', // TODO: Find correct Netlify URL
    '666': 'https://trapstars-assets.netlify.app/background/666.png',
    'Cave': 'https://trapstars-assets.netlify.app/background/cave.png',
    'Christmas': 'https://trapstars-assets.netlify.app/background/christmas.png',
    'Expensive': 'https://trapstars-assets.netlify.app/background/expensive.png',
    'Flames': 'https://trapstars-assets.netlify.app/background/flames.png',
    'Going Dark': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774717/Going_Dark_qddxvx.png', // TODO: Find correct Netlify URL
    'Grow House': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774731/Grow_House_aggrgh.png', // TODO: Find correct Netlify URL
    'Gucci': 'https://trapstars-assets.netlify.app/background/gucci.png',
    'Lambo': 'https://trapstars-assets.netlify.app/background/lambo.png',
    'Lights': 'https://trapstars-assets.netlify.app/background/lights.png',
    'Locked Up': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774746/Locked_Up_cv55tw.png', // TODO: Find correct Netlify URL
    'Maduro': 'https://trapstars-assets.netlify.app/background/madurobg.png',
    'Mansion': 'https://trapstars-assets.netlify.app/background/mansion.png',
    'Metal': 'https://trapstars-assets.netlify.app/background/metal.png',
    'Moon': 'https://trapstars-assets.netlify.app/background/moon.png',
    'Penthouse': 'https://trapstars-assets.netlify.app/background/penthouse.png',
    'Pick Your Weapon': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774760/Pick_Your_Weapon_ejusgs.png', // TODO: Find correct Netlify URL
    'Private Jet RR': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774750/Private_Jet_RR_lkhfl7.png', // TODO: Find correct Netlify URL
    'RR 1': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774750/RR_1_bm6stm.png', // TODO: Find correct Netlify URL
    'RR Inside': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774749/RR_Inside_lrowrc.png', // TODO: Find correct Netlify URL
    'Scarface 2': 'https://trapstars-assets.netlify.app/background/scarface2.png',
    'Sega': 'https://trapstars-assets.netlify.app/background/sega.png',
    'Studio': 'https://trapstars-assets.netlify.app/background/studio.png',
    'Tony Montana': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774771/Tony_Montana.png', // TODO: Find correct Netlify URL
    'Trap 1': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774773/Trap_1.png', // TODO: Find correct Netlify URL
    'Trap 2': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774768/Trap_2.png', // TODO: Find correct Netlify URL
    'Up In Space': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774760/Up_In_Space_ftsynt.png', // TODO: Find correct Netlify URL
    'Vapot': 'https://trapstars-assets.netlify.app/background/vapot.png',
    'Views': 'https://trapstars-assets.netlify.app/background/views.png'
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
