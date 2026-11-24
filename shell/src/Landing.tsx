import { useIterraGlass } from './ui/glass';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, FolderOpen, HardDrive, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AtlasGlobe } from './mosaic/AtlasGlobe';
import { PLACE_MAP } from './places';
import './landing.css';

const groups = [
  { title: 'Plan your day', ids: ['boxed', 'syllabus', 'rhythm'] },
  { title: 'Study the material', ids: ['ink', 'margin', 'flashcards'] },
  { title: 'Practice & measure', ids: ['timer', 'proof', 'gradestack'] },
];

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
            <h1 id="atlas-title">A world for<br />your <em>studies.</em></h1>
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
        <footer><p><HardDrive size={16} /> Your workspace saves on this device.</p><button className="atlas-link" onClick={() => onGo('#/today?sample=1')}>Preview a sample semester <ArrowUpRight size={14} /></button><button className="atlas-link" onClick={() => onGo('#/settings')}>Data &amp; backup <ArrowUpRight size={14} /></button></footer>
      </section>
    </div>
  );
}
