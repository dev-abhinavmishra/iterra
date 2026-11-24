import { useEffect, useState } from 'react';
import './today-pixel-garden.css';

export type GardenDaypart = 'morning' | 'daytime' | 'evening' | 'night';
export type GardenTheme = 'paper' | 'graphite';

export function getGardenDaypart(date: Date): GardenDaypart {
  const hour = date.getHours();
  if (hour < 5 || hour >= 21) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'daytime';
  return 'evening';
}

function millisecondsToNextDaypart(now: Date): number {
  const nextHour = [5, 11, 17, 21].find((hour) => hour > now.getHours());
  const next = new Date(now);
  if (nextHour === undefined) {
    next.setDate(next.getDate() + 1);
    next.setHours(5, 0, 0, 0);
  } else {
    next.setHours(nextHour, 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - now.getTime() + 50);
}

export function TodayPixelGarden({ theme }: { theme: GardenTheme }) {
  const [daypart, setDaypart] = useState<GardenDaypart>(() => getGardenDaypart(new Date()));

  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setDaypart(getGardenDaypart(now));
      timer = window.setTimeout(refresh, millisecondsToNextDaypart(now));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return (
    <div
      className="today-pixel-garden"
      data-daypart={daypart}
      data-theme={theme}
      aria-hidden="true"
    >
      <svg className="today-pixel-garden__scene" viewBox="0 0 1200 430" preserveAspectRatio="xMidYMin slice" focusable="false">
        <rect className="garden-sky" width="1200" height="430" />
        <g className="garden-clouds" shapeRendering="crispEdges">
          <path d="M171 120h70v14h-14v14h-70v-14h14zM751 83h84v14h-14v14h-84V97h14z" />
          <path d="M280 158h42v8h-42zM888 117h54v8h-54z" />
        </g>
        <g className="garden-celestial" shapeRendering="crispEdges">
          <circle className="garden-sun" cx="900" cy="116" r="31" />
          <path className="garden-moon" d="M915 70a32 32 0 1 0 34 44 27 27 0 0 1-34-44z" />
          <g className="garden-stars">
            <path d="M196 82h8v8h-8zM332 106h6v6h-6zM1052 94h8v8h-8zM1092 150h6v6h-6zM487 74h6v6h-6z" />
          </g>
        </g>
        <g className="garden-hills" shapeRendering="crispEdges">
          <path d="M0 234h190v-20h110v-18h150v24h115v-16h142v22h134v-14h125v21h134v-19h100v126H0z" />
          <path className="garden-hill-back" d="M0 268h140v-18h133v13h116v-24h115v22h150v-15h101v22h131v-18h144v22h170v92H0z" />
        </g>
        <g className="garden-terrace" shapeRendering="crispEdges">
          <path className="garden-wall" d="M0 308h1200v122H0z" />
          <path className="garden-wall-cap" d="M0 300h1200v14H0z" />
          <path className="garden-path" d="M0 350h1200v80H0z" />
          <path className="garden-path-line" d="M0 350h1200v5H0z" />
          <path className="garden-step" d="M420 378h360v12H420zM455 390h290v12H455z" />
        </g>
        <g className="garden-planters" shapeRendering="crispEdges">
          <path className="garden-pot" d="M92 316h152l-12 62H104z" />
          <path className="garden-pot-rim" d="M82 308h172v13H82z" />
          <path className="garden-pot" d="M944 316h170l-13 62H958z" />
          <path className="garden-pot-rim" d="M934 308h190v13H934z" />
          <path className="garden-leaf-dark" d="M112 306v-54h13v-30h18v28h13v-42h19v47h15v-30h17v42h16v39z" />
          <path className="garden-leaf" d="M142 308v-38h14v-28h17v40h14v-53h18v58h18v21z" />
          <path className="garden-leaf-dark" d="M975 306v-45h16v-40h19v47h16v-30h18v51h20v17z" />
          <path className="garden-leaf" d="M1004 308v-30h16v-40h20v39h16v-54h18v61h19v24z" />
        </g>
        <g className="garden-bench" shapeRendering="crispEdges">
          <path d="M498 287h204v18H498zM512 309h176v17H512zM524 326h15v40h-15zM661 326h15v40h-15z" />
          <path className="garden-bench-highlight" d="M505 291h190v4H505z" />
        </g>
        <g className="garden-vines" shapeRendering="crispEdges">
          <path d="M0 270h46v-44h16v-34h16v54H62v40H0zM1122 264h28v-54h17v-32h17v52h-17v41h-45z" />
          <path className="garden-flower" d="M58 201h10v10H58zM1163 187h10v10h-10zM1080 279h9v9h-9zM125 260h8v8h-8z" />
        </g>
      </svg>
      <div className="today-pixel-garden__veil" />
    </div>
  );
}
