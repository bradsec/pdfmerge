export const ICON_SPRITE_URL = 'images/icons.svg?v=1.3.2';

export function createIcon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `${ICON_SPRITE_URL}#${name}`);
    svg.appendChild(use);
    return svg;
}
