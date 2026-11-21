import { useEffect, useState } from 'react';

export const ROUTES = ['/', '/speeches', '/news', '/law'] as const;
export type Route = (typeof ROUTES)[number];

function parseHash(): Route {
  const h = (window.location.hash || '#/').replace('#', '');
  const route = h === '' ? '/' : h;
  return (ROUTES as readonly string[]).includes(route) ? (route as Route) : '/';
}

/**
 * Hash 路由。
 *
 * 用 hash 而非 history API：站点托管在 GitHub Pages 的子路径下，
 * history 路由需要服务端把未知路径重写到 index.html，而 Pages 不支持。
 * hash 路由无需任何服务端配置。
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(route: Route): void {
  window.location.hash = '#' + route;
}
