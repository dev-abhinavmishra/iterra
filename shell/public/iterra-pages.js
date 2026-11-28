(function(){var b=document.querySelector('[data-nav-toggle]'),s=document.body,c=document.querySelector('[data-nav-close]');
function set(o){s.classList.toggle('nav-open',o);if(b)b.setAttribute('aria-expanded',o?'true':'false');}
if(b)b.addEventListener('click',function(){set(!s.classList.contains('nav-open'))});
if(c)c.addEventListener('click',function(){set(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape')set(false)});
var side=document.querySelector('.side');
if(side){
  if(matchMedia('(prefers-reduced-motion: no-preference)').matches){
    [].slice.call(side.querySelectorAll('.brand,.searchbox,.navg,.end')).forEach(function(el,i){
      el.style.animation='doc-arrive .55s cubic-bezier(.2,.7,.2,1) both';el.style.animationDelay=(80+i*70)+'ms';
    });
  }
  var on=side.querySelector('nav a.on');
  if(on&&side.scrollHeight>side.clientHeight+4){side.scrollTop=Math.max(0,on.offsetTop-side.clientHeight/2);}
}
var links=document.querySelectorAll('.side nav a');for(var i=0;i<links.length;i++)links[i].addEventListener('click',function(){set(false)});
var nf=document.getElementById('navfilter');
if(nf){
  var navAs=[].slice.call(document.querySelectorAll('.side nav a'));
  var navGs=[].slice.call(document.querySelectorAll('.side .navg'));
  var navEmpty=document.querySelector('.nav-empty');
  var navMore=document.querySelector('.nav-more');
  var navMoreBtn=document.querySelector('[data-more]');
  if(navMore&&navMoreBtn){
    navMoreBtn.addEventListener('click',function(){
      var open=navMore.hasAttribute('hidden');
      navMore.classList.toggle('uopen',open);
      navMoreBtn.setAttribute('aria-expanded',open?'true':'false');
      if(open){navMore.removeAttribute('hidden');navMoreBtn.textContent='Show fewer'}
      else{navMore.setAttribute('hidden','');navMoreBtn.textContent='Show all guides'}
    });
  }
  function applyFilter(){
    var q=nf.value.trim().toLowerCase();
    if(navMore){if(q)navMore.removeAttribute('hidden');else if(!navMore.classList.contains('uopen'))navMore.setAttribute('hidden','')}
    navAs.forEach(function(a){a.style.display=!q||a.textContent.toLowerCase().indexOf(q)>-1?'':'none'});
    navGs.forEach(function(g){
      var any=navAs.some(function(a){return a.closest('.navg')===g&&a.style.display!=='none'});
      g.style.display=any?'':'none';
    });
    if(navEmpty)navEmpty.classList.toggle('show',!!q&&navAs.every(function(a){return a.style.display==='none'}));
  }
  nf.addEventListener('input',applyFilter);
  document.addEventListener('keydown',function(e){
    if((e.key==='/'&&!/input|textarea/i.test(document.activeElement.tagName))||((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k')){e.preventDefault();nf.focus();nf.select();}
  });
}
[].slice.call(document.querySelectorAll('.compare-table,.prose-table')).forEach(function(tbl){
  tbl.addEventListener('mousemove',function(e){
    var c=e.target.closest?e.target.closest('td,th'):null;
    if(!c)return;
    var cells=c.parentNode.children,idx=-1;for(var j=0;j<cells.length;j++)if(cells[j]===c){idx=j;break}
    if(idx<0)return;
    var rows=tbl.querySelectorAll('tr');
    for(var k=0;k<rows.length;k++){var cell=rows[k].children[idx];if(cell)cell.classList.add('col')}
  });
  tbl.addEventListener('mouseleave',function(){
    var cs=tbl.querySelectorAll('.col');for(var j=0;j<cs.length;j++)cs[j].classList.remove('col');
  });
});
var tt=document.createElement('button');tt.className='to-top';tt.type='button';tt.setAttribute('aria-label','Back to top');tt.textContent='↑';document.body.appendChild(tt);
addEventListener('scroll',function(){tt.classList.toggle('on',scrollY>640)},{passive:true});
tt.addEventListener('click',function(){scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});
[].slice.call(document.querySelectorAll('[data-copy]')).forEach(function(btn){
  btn.addEventListener('click',function(){
    var done=function(){btn.textContent='Copied ✓';btn.classList.add('copied');setTimeout(function(){btn.textContent='Copy link';btn.classList.remove('copied')},1600)};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(done,done);
    else done();
  });
});
[].slice.call(document.querySelectorAll('.rows-more')).forEach(function(btn){
  btn.setAttribute('aria-expanded','false');
  btn.addEventListener('click',function(){
    var ul=btn.previousElementSibling,open=btn.getAttribute('aria-expanded')==='true';
    [].slice.call(ul.querySelectorAll('li[hidden]')).forEach(function(li){li.hidden=open});
    btn.setAttribute('aria-expanded',open?'false':'true');
    btn.textContent=open?'Show all '+ul.querySelectorAll('li').length+' guides':'Show fewer';
  });
});
if(document.querySelector('.guide-article'))(function(){
  var KEY='itr-reader',btn=document.createElement('button');
  btn.type='button';btn.className='reader-toggle';btn.textContent='Reader';
  btn.setAttribute('aria-pressed','false');btn.setAttribute('aria-label','Toggle reader mode');
  document.body.appendChild(btn);
  var on=false;try{on=localStorage.getItem(KEY)==='1'}catch(e){}
  function apply(){document.body.classList.toggle('reader',on);btn.classList.toggle('on',on);btn.setAttribute('aria-pressed',on?'true':'false');btn.textContent=on?'Exit reader':'Reader'}
  apply();
  btn.addEventListener('click',function(){on=!on;try{localStorage.setItem(KEY,on?'1':'0')}catch(e){}apply()});
})();
var onChip=document.querySelector('.series .chips a.on');
if(onChip&&onChip.scrollIntoView)onChip.scrollIntoView({inline:'center',block:'nearest'});
if(document.querySelector('.guide-article,.compare-table'))(function(){
  var KEY='itr-read:'+location.pathname,art=document.querySelector('.guide-article,.content>.wrap')||document.body;
  function frac(){var r=art.getBoundingClientRect(),total=r.height-innerHeight;return total>0?Math.min(1,Math.max(0,-r.top/total)):0}
  var saved=null;try{saved=parseFloat(localStorage.getItem(KEY))}catch(e){}
  var chip=document.createElement('button');chip.type='button';chip.className='resume-chip';chip.setAttribute('aria-label','Resume reading where you left off');
  chip.innerHTML='<span>Resume reading</span><span class="pct"></span>';
  document.body.appendChild(chip);
  var shown=false;
  function maybeShow(){if(saved>0.15&&saved<0.9&&!shown){chip.querySelector('.pct').textContent=Math.round(saved*100)+'%';chip.style.display='inline-flex';shown=true}}
  setTimeout(maybeShow,900);
  chip.addEventListener('click',function(){
    var r=art.getBoundingClientRect();
    var target=scrollY+r.top+saved*Math.max(0,r.height-innerHeight);
    scrollTo({top:Math.max(0,target),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    chip.style.display='none';shown=true;
  });
  var t=null;
  addEventListener('scroll',function(){
    clearTimeout(t);t=setTimeout(function(){var f=frac();try{f>0.97?localStorage.removeItem(KEY):localStorage.setItem(KEY,String(f))}catch(e){}},400);
  },{passive:true});
})();
var pPrev=document.querySelector('.pager a:not(.next)'),pNext=document.querySelector('.pager .next');
if(pPrev||pNext)document.addEventListener('keydown',function(e){
  if(/input|textarea|select/i.test(document.activeElement.tagName))return;
  if(e.key===']'&&pNext){e.preventDefault();pNext.click()}
  if(e.key==='['&&pPrev){e.preventDefault();pPrev.click()}
});
var fimgs=[].slice.call(document.querySelectorAll('.frame img'));
if(fimgs.length){
  var lb=document.createElement('div');lb.className='lightbox';lb.setAttribute('role','dialog');lb.setAttribute('aria-label','Image preview');
  lb.innerHTML='<figure><button type="button" class="lb-x" aria-label="Close preview">×</button><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(lb);
  var lbImg=lb.querySelector('img'),lbCap=lb.querySelector('figcaption'),lbX=lb.querySelector('.lb-x');
  function closeLb(){lb.classList.remove('on')}
  fimgs.forEach(function(im){
    im.addEventListener('click',function(){
      lbImg.src=im.currentSrc||im.src;lbImg.alt=im.alt||'';lbCap.textContent=im.alt||'';
      lb.classList.add('on');document.body.style.overflow='hidden';
    });
  });
  lb.addEventListener('click',function(e){if(e.target===lb||e.target===lbImg)closeLb()});
  lbX.addEventListener('click',closeLb);
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeLb()});
}
[].slice.call(document.querySelectorAll('.checklist')).forEach(function(ul){
  var key='itcl:'+location.pathname+'#'+(ul.getAttribute('data-cl')||'');
  var saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  [].slice.call(ul.querySelectorAll('li')).forEach(function(li,i){
    var cb=li.querySelector('input');if(!cb)return;
    if(saved[i])cb.checked=true;
    cb.addEventListener('change',function(){
      saved[i]=cb.checked?1:0;
      try{localStorage.setItem(key,JSON.stringify(saved))}catch(e){}
    });
  });
});
var rv=document.querySelectorAll('.content .block,.content .plate,.content .article-cover,.content .related,.content .pager,.content .tldr,.content .takeaways,.content .article-end');
if(rv.length&&'IntersectionObserver' in window&&matchMedia('(prefers-reduced-motion: no-preference)').matches){
  [].slice.call(rv).forEach(function(el){el.classList.add('rv')});
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}})},{threshold:.06,rootMargin:'0px 0px -5% 0px'});
  [].slice.call(rv).forEach(function(el){io.observe(el)});
}
})();
;(function(){var el=document.querySelector('[data-read-count]');if(!el)return;try{var n=0,total=+el.getAttribute('data-total')||0;for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('itr-read:')===0)n++}if(n>0){el.textContent="You've read "+n+" of "+total+" guides — pick up where you left off";el.hidden=false}}catch(e){}})();
