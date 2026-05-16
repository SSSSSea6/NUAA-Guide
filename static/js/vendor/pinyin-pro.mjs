export function pinyin(text, options = {}) {
    const value = String(text || "");
    if (options.type === "array") {
        return Array.from(value).filter((char) => char.trim());
    }
    return value;
}
