import { useIterraGlass } from './ui/glass';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, FolderOpen, HardDrive, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AtlasGlobe } from './mosaic/AtlasGlobe';
import { MosaicScene } from './mosaic/MosaicScene';
import { PLACE_MAP } from './places';
import './landing.css';

const groups = [
  { title: 'Plan your day', ids: ['boxed', 'syllabus', 'rhythm'] },
  { title: 'Study the material', ids: ['ink', 'margin', 'flashcards'] },
  { title: 'Practice & measure', ids: ['timer', 'proof', 'gradestack'] },
];

export function LandingNav() {
  const lens = useIterraGlass<HTMLSpanElement>('navigation');
  function jump(id: string) {
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    const scroller = target?.closest('main');
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    if (id === 'atlas-title') scroller?.scrollTo({ top: 0, behavior });
    else target?.scrollIntoView({ block: 'start', behavior });
  }
  return (
    <header className="atlas-nav">
      <button className="atlas-nav-brand" onClick={() => jump('atlas-title')} aria-label="Iterra overview">Iterra</button>
      <nav className="atlas-nav-links it-nav-band" aria-label="Landing navigation">
        <span ref={lens} className="it-nav-optic it-lens" aria-hidden="true" />
        <button onClick={() => jump('atlas-tools')}>Study atlas</button>
        <a href="/guides">Guides</a>
        <a href="#/today">Open workspace <ArrowUpRight size={14} aria-hidden="true" /></a>
      </nav>
    </header>
  );
}

export function LandingPage({ onEnter, onGo }: { onEnter: (id: string) => void; onGo: (url: string) => void }) {
  const controlsLens = useIterraGlass<HTMLDivElement>('atlas');
  const directory = useRef<HTMLHeadingElement>(null);
  const [moving, setMoving] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMoving(!motion.matches);
    motion.addEventListener('change', sync);
    return () => motion.removeEventListener('change', sync);
  }, []);
  return (
    <div className="atlas-page" data-moving={moving}>
      <section className="atlas-sky" aria-labelledby="atlas-title">
        <div className="atlas-contours" aria-hidden="true" />
        <div className="atlas-stars" aria-hidden="true" />
        <div className="atlas-hero">
          <div className="atlas-copy">
            <div className="atlas-wordmark"><span className="atlas-emblem" aria-hidden="true"><i /><i /><i /><i /></span> Iterra</div>
            <h1 id="atlas-title" tabIndex={-1}>A world for{' '}<br />your <em>studies.</em></h1>
            <p>Give every course a place. Bring your plans, notes, and practice together in one study workspace.</p>
            <div className="atlas-actions">
              <button className="atlas-enter" onClick={() => onGo('#/today')}>Open Today <ArrowRight size={17} /></button>
              <button className="atlas-explore" onClick={() => {
                directory.current?.focus({ preventScroll: true });
                directory.current?.scrollIntoView({ block: 'start', behavior: moving ? 'smooth' : 'instant' });
              }}>Explore tools <ArrowDown size={15} /></button>
            </div>
          </div>
          <div className="atlas-instrument">
            <div className="atlas-dial" aria-hidden="true"><span>N</span><span>E</span><span>S</span><span>W</span></div>
            <div className="atlas-orbit atlas-orbit-back" aria-hidden="true" />
            <AtlasGlobe moving={moving} turn={turn} />
            <div className="atlas-orbit atlas-orbit-front" aria-hidden="true"><i /></div>
            <div className="atlas-flight" aria-hidden="true"><i /></div>
            <div ref={controlsLens} className="atlas-controls it-lens" aria-label="Globe controls" role="group">
              <button aria-label="Rotate globe west" onClick={() => setTurn(a => a - Math.PI / 6)}><ArrowLeft size={15} /></button>
              <button aria-label={moving ? 'Pause animation' : 'Play animation'} onClick={() => setMoving(m => !m)}>{moving ? <Pause size={13} /> : <Play size={13} />}</button>
              <button aria-label="Rotate globe east" onClick={() => setTurn(a => a + Math.PI / 6)}><ArrowRight size={15} /></button>
            </div>
          </div>
        </div>
      </section>
      <section className="atlas-catalog" aria-labelledby="atlas-tools">
        <div className="atlas-catalog-head">
          <h2 ref={directory} id="atlas-tools" tabIndex={-1}>The study atlas</h2>
          <button className="atlas-link" onClick={() => onGo('#/courses')}><FolderOpen size={16} /> Browse courses <ArrowUpRight size={14} /></button>
        </div>
        <div className="atlas-groups">
          {groups.map((group, index) => (
            <section key={group.title} className="atlas-group">
              <div className="atlas-terrain"><img src={`/atlas/terrain-${index}.webp`} alt="" width="980" height="252" loading="lazy" /></div>
              <h3>{group.title}</h3>
              {group.ids.map(id => {
                const place = PLACE_MAP[id];
                return <button key={id} className="atlas-tool" onClick={() => onEnter(id)}>
                  <span className="atlas-glyph" aria-hidden="true">{place.glyph}</span>
                  <span><strong>{place.app}</strong><small>{place.shortDesc}</small></span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>;
              })}
            </section>
          ))}
        </div>
      </section>
      <footer className="atlas-end">
        <MosaicScene className="atlas-end-mosaic" />
        <div className="atlas-horizon" aria-hidden="true"><i /></div>
        <div className="atlas-signature">Iterra<span aria-hidden="true">✧</span></div>
        <div className="atlas-end-links"><p><HardDrive size={16} /> Your workspace saves on this device.</p><nav className="atlas-end-nav" aria-label="Resources">
          <a href="/guides">Study guides</a>
          <a href="/tools">Tools</a>
          <a href="/compare">Comparisons</a>
          <button className="atlas-link" onClick={() => onGo('#/settings')}>Data &amp; backup <ArrowUpRight size={14} /></button>
        </nav></div>
      </footer>
    </div>
  );
}
