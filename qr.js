module.exports = function qr(value) {
  // QR Model 2, version 3-L, byte mode, mask 0.
  const data = Buffer.from(value);
  if (data.length > 53) throw new Error('Endereço longo demais');
  const bits = [0,1,0,0];
  const append = (n, width) => { for (let i=width-1;i>=0;i--) bits.push((n>>i)&1); };
  append(data.length,8);
  for (const byte of data) append(byte,8);
  append(0,4);
  while (bits.length%8) bits.push(0);
  const words = [];
  for (let i=0;i<bits.length;i+=8) words.push(parseInt(bits.slice(i,i+8).join(''),2));
  for (let i=0;words.length<55;i++) words.push(i%2 ? 17 : 236);
  function multiply(a,b) {
    let r=0;
    while(b) { if(b&1) r^=a; b>>=1; a=(a<<1)^((a&128)?285:0); }
    return r;
  }
  let poly=[1], root=1;
  for(let i=0;i<15;i++) {
    const next=[...poly,0];
    for(let j=0;j<poly.length;j++) next[j+1]^=multiply(poly[j],root);
    poly=next; root=multiply(root,2);
  }
  const remainder=[...words,...Array(15).fill(0)];
  for(let i=0;i<55;i++) {
    const factor=remainder[i];
    for(let j=1;j<=15;j++) remainder[i+j]^=multiply(poly[j],factor);
  }
  bits.length=0;
  for(const byte of [...words,...remainder.slice(55)]) append(byte,8);
  const size=29, grid=Array.from({length:size},()=>Array(size).fill(null));
  const set=(x,y,v)=>{ if(x>=0&&x<size&&y>=0&&y<size) grid[y][x]=Number(v); };
  for(const [cx,cy] of [[3,3],[25,3],[3,25]]) {
    for(let y=-4;y<=4;y++) for(let x=-4;x<=4;x++) {
      const d=Math.max(Math.abs(x),Math.abs(y));
      set(cx+x,cy+y,d!==2&&d!==4);
    }
  }
  for(let i=8;i<21;i++) { set(6,i,i%2===0); set(i,6,i%2===0); }
  for(let y=-2;y<=2;y++) for(let x=-2;x<=2;x++) set(22+x,22+y,Math.max(Math.abs(x),Math.abs(y))!==1);
  const format=i=>(0x77c4>>i)&1;
  for(let i=0;i<6;i++) set(8,i,format(i));
  set(8,7,format(6)); set(8,8,format(7)); set(7,8,format(8));
  for(let i=9;i<15;i++) set(14-i,8,format(i));
  for(let i=0;i<8;i++) set(28-i,8,format(i));
  for(let i=8;i<15;i++) set(8,14+i,format(i));
  set(8,21,1);
  let k=0, up=true;
  for(let right=28;right>0;right-=2) {
    if(right===6) right--;
    for(let row=0;row<size;row++) {
      const y=up?28-row:row;
      for(let x=right;x>=right-1;x--) if(grid[y][x]===null) set(x,y,(bits[k++]??0)^((x+y)%2===0));
    }
    up=!up;
  }
  const path=grid.flatMap((row,y)=>row.map((v,x)=>v?'M'+(x+4)+' '+(y+4)+'h1v1h-1z':'')).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" shape-rendering="crispEdges"><rect width="37" height="37" fill="white"/><path d="'+path+'" fill="#111827"/></svg>';
};
