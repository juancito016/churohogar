import { useEffect } from 'react';

interface SEOOptions {
    title: string;
    description?: string;
    canonicalPath?: string;
}

const SITE_URL = 'https://churohogar.com';

const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
};

export const useSEO = ({ title, description, canonicalPath }: SEOOptions) => {
    useEffect(() => {
        document.title = title;

        if (description) {
            setMeta('name', 'description', description);
            setMeta('property', 'og:description', description);
        }
        setMeta('property', 'og:title', title);

        if (canonicalPath !== undefined) {
            const url = `${SITE_URL}${canonicalPath}`;
            setMeta('property', 'og:url', url);
            let canonical = document.head.querySelector('link[rel="canonical"]');
            if (!canonical) {
                canonical = document.createElement('link');
                canonical.setAttribute('rel', 'canonical');
                document.head.appendChild(canonical);
            }
            canonical.setAttribute('href', url);
        }
    }, [title, description, canonicalPath]);
};
