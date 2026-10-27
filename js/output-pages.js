export function needsDuplexPadding(pageCount, isFinalCard) {
    return !isFinalCard && pageCount % 2 === 1;
}

export function parsePageNumberTemplate(template, { requireNumber = true } = {}) {
    if (!template?.trim() || template.length > 100) return { error: 'Enter a template of 1 to 100 characters.' };
    const tokens = [];
    let literal = '';
    let hasNumber = false;
    for (let i = 0; i < template.length;) {
        if (template.startsWith('{{', i) || template.startsWith('}}', i)) {
            literal += template[i];
            i += 2;
        } else if (template[i] === '{') {
            const end = template.indexOf('}', i + 1);
            const content = end < 0 ? '' : template.slice(i + 1, end);
            const match = /^(n|total)(?::([1-6]))?$|^(file)$/.exec(content);
            const dateTime = /^(date|time)(?::(.*))?$/.exec(content);
            if (!match && (!dateTime || dateTime[2] === '' || dateTime[2]?.includes('{'))) {
                return { error: 'Use valid placeholders and formats; escape literal braces with {{ and }}.' };
            }
            if (literal) tokens.push(literal);
            literal = '';
            if (match) {
                tokens.push({ name: match[1] || match[3], width: Number(match[2] || 1) });
                hasNumber ||= match[1] === 'n';
            } else {
                tokens.push({ name: dateTime[1], format: dateTime[2] ||
                    (dateTime[1] === 'date' ? 'YYYY-MM-DD' : 'HH:mm') });
            }
            i = end + 1;
        } else if (template[i] === '}') {
            return { error: 'Use {n}, {total}, {file}, or widths 1–6; escape braces with {{ and }}.' };
        } else {
            literal += template[i++];
        }
    }
    if (requireNumber && !hasNumber) return { error: 'Include {n} in the template.' };
    if (literal) tokens.push(literal);
    return { tokens };
}

export function formatDateTime(date, format) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const pad = value => String(value).padStart(2, '0');
    const hour = date.getHours();
    const values = {
        YYYY: date.getFullYear(), YY: pad(date.getFullYear() % 100),
        MMMM: months[date.getMonth()], MMM: months[date.getMonth()].slice(0, 3),
        MM: pad(date.getMonth() + 1), M: date.getMonth() + 1,
        DD: pad(date.getDate()), D: date.getDate(),
        dddd: weekdays[date.getDay()], ddd: weekdays[date.getDay()].slice(0, 3),
        HH: pad(hour), H: hour, hh: pad(hour % 12 || 12), h: hour % 12 || 12,
        mm: pad(date.getMinutes()), ss: pad(date.getSeconds()), A: hour < 12 ? 'AM' : 'PM'
    };
    let output = '';
    for (let i = 0; i < format.length;) {
        if (format[i] === '[' && format.indexOf(']', i + 1) !== -1) {
            const end = format.indexOf(']', i + 1);
            output += format.slice(i + 1, end);
            i = end + 1;
            continue;
        }
        const token = /^(YYYY|MMMM|dddd|MMM|ddd|YY|MM|DD|HH|hh|mm|ss|M|D|H|h|A)/.exec(format.slice(i))?.[0];
        output += token ? values[token] : format[i];
        i += token?.length || 1;
    }
    return output;
}

export function formatPageNumber(number, total, tokens, file = '', date) {
    return tokens.map(token => {
        if (typeof token === 'string') return token;
        if (token.name === 'date' || token.name === 'time') return formatDateTime(date, token.format);
        const value = token.name === 'file' ? file : token.name === 'n' ? number : total;
        return token.name === 'file' ? value : String(value).padStart(token.width, '0');
    }).join('').replace(/\s+/g, ' ').trim();
}

export function fitPageNumberSize(visibleWidth, measureWidth, margin = 24) {
    const width = measureWidth(10);
    return width > visibleWidth - 2 * margin ? Math.max(6, 10 * (visibleWidth - 2 * margin) / width) : 10;
}

export function mmToPt(mm) {
    return mm * 72 / 25.4;
}

export function parseTextMargin(value) {
    const text = String(value).trim();
    const number = Number(text);
    return /^\d+(?:\.\d+)?$/.test(text) && number >= 0 && number <= 50 &&
        Number.isInteger(number * 2) ? number : null;
}

export function parsePageNumberStart(value) {
    const text = String(value).trim();
    const number = Number(text);
    return /^\d+$/.test(text) && Number.isSafeInteger(number) && number >= 1 ? number : null;
}

export function needsNumberingStart(pageNumbers, header, footer) {
    return pageNumbers || header || footer;
}

export function shouldDrawOnPage(index, skipFirst) {
    return index > 0 || !skipFirst;
}

export function getTextOverlap(pageNumberPosition, headerAlignment, footerAlignment) {
    if (!pageNumberPosition) return null;
    if (pageNumberPosition === `top-${headerAlignment}`) return 'header';
    if (pageNumberPosition === `bottom-${footerAlignment}`) return 'footer';
    return null;
}

export function getTextPlacement(cropBox, angle, edge, align, textWidth, fontSize, margin = 24) {
    const rotation = ((angle % 360) + 360) % 360;
    const visibleWidth = rotation % 180 ? cropBox.height : cropBox.width;
    const visibleHeight = rotation % 180 ? cropBox.width : cropBox.height;
    const x = align === 'left' ? margin : align === 'centre'
        ? (visibleWidth - textWidth) / 2 : visibleWidth - margin - textWidth;
    const y = edge === 'top' ? visibleHeight - margin - fontSize : margin;

    switch (rotation) {
        case 90: return { x: cropBox.x + cropBox.width - y, y: cropBox.y + x, rotation };
        case 180: return { x: cropBox.x + cropBox.width - x, y: cropBox.y + cropBox.height - y, rotation };
        case 270: return { x: cropBox.x + y, y: cropBox.y + cropBox.height - x, rotation };
        default: return { x: cropBox.x + x, y: cropBox.y + y, rotation };
    }
}

export function getTextBox(placement, textWidth, fontSize) {
    const offset = {
        0: [-3, -3], 90: [3, -3], 180: [3, 3], 270: [-3, 3]
    }[placement.rotation];
    return {
        x: placement.x + offset[0], y: placement.y + offset[1],
        width: textWidth + 6, height: fontSize + 6, rotation: placement.rotation
    };
}

export function getPageNumberPlacement(cropBox, angle, position, textWidth, fontSize) {
    const [edge, align] = position.split('-');
    return getTextPlacement(cropBox, angle, edge, align, textWidth, fontSize);
}
