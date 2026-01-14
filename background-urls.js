// Background image URLs - using original Cloudinary hosting for reliability
export const BACKGROUND_URLS = {
    '2 Face': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774713/2_Face_d67nki.png',
    '21 21': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774725/21_21_cwiymn.png',
    '666': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774715/666_pcb2az.png',
    'Cave': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774713/Cave_e41vfi.png',
    'Christmas': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774722/Christmas_xuybxf.png',
    'Expensive': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774724/Expensive_jg2rqg.png',
    'Flames': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774722/Flames_ixwrmj.png',
    'Going Dark': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774717/Going_Dark_qddxvx.png',
    'Grow House': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774731/Grow_House_aggrgh.png',
    'Gucci': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774732/Gucci_qkz0qe.png',
    'Lambo': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774740/Lambo_ccuzd7.png',
    'Lights': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774731/Lights_khnhck.png',
    'Locked Up': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774746/Locked_Up_cv55tw.png',
    'Maduro': 'https://trapstars-assets.netlify.app/background/madurobg.png',
    'Mansion': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774738/Mansion_inrdzm.png',
    'Metal': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774738/Metal_unfq5u.png',
    'Moon': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774736/Moon_pgkcx2.png',
    'Penthouse': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774746/Penthouse_ucmemq.png',
    'Pick Your Weapon': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774760/Pick_Your_Weapon_ejusgs.png',
    'Private Jet RR': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774750/Private_Jet_RR_lkhfl7.png',
    'RR 1': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774750/RR_1_bm6stm.png',
    'RR Inside': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774749/RR_Inside_lrowrc.png',
    'Scarface 2': 'https://trapstars-assets.netlify.app/background/scarface2.png',
    'Sega': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774757/Sega_pte6in.png',
    'Studio': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774763/Studio.png',
    'Tony Montana': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774771/Tony_Montana.png',
    'Trap 1': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774773/Trap_1.png',
    'Trap 2': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774768/Trap_2.png',
    'Up In Space': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774760/Up_In_Space_ftsynt.png',
    'Vapot': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774774/Vapot.png',
    'Views': 'https://res.cloudinary.com/dhirimesk/image/upload/v1763774772/Views.png'
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
