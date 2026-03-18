/**
 * ShaderBackground.tsx
 *
 * Full-screen animated WebGL shader — amber phosphor / radar-ring aesthetic.
 * Works 100% offline — HTML + shader inlined, no CDN needed.
 * Positioned absolutely behind all UI via pointerEvents="none".
 */

import React from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';

// Single-channel brightness → amber tint (rgb 0.96, 0.62, 0.04)
// Produces soft phosphor CRT rings that feel like a radar / positioning terminal.
const FS_LINES = [
  'precision highp float;',
  'uniform vec2 resolution;uniform float time;',
  'void main(void){',
  '  vec2 uv=(gl_FragCoord.xy*2.0-resolution.xy)/min(resolution.x,resolution.y);',
  '  float t=time*0.04;float lw=0.0015;float b=0.0;',
  '  for(int i=0;i<8;i++){',
  '    b+=lw*float(i*i)/abs(fract(t+float(i)*0.13)*5.0-length(uv)+mod(uv.x+uv.y,0.2));',
  '  }',
  '  gl_FragColor=vec4(b*0.96,b*0.62,b*0.04,1.0);}',
];

const SHADER_HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0}body{background:#050400;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
</head><body><canvas id="c"></canvas><script>
(function(){
  var c=document.getElementById('c');
  var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
  if(!gl){return;}
  var vs='attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}';
  var fs=${JSON.stringify(FS_LINES.join(''))};
  function mk(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;}
  var prog=gl.createProgram();
  gl.attachShader(prog,mk(gl.VERTEX_SHADER,vs));
  gl.attachShader(prog,mk(gl.FRAGMENT_SHADER,fs));
  gl.linkProgram(prog);gl.useProgram(prog);
  var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  var pl=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(pl);
  gl.vertexAttribPointer(pl,2,gl.FLOAT,false,0,0);
  var tl=gl.getUniformLocation(prog,'time');
  var rl=gl.getUniformLocation(prog,'resolution');
  function resize(){
    c.width=window.innerWidth*window.devicePixelRatio;
    c.height=window.innerHeight*window.devicePixelRatio;
    gl.viewport(0,0,c.width,c.height);
    gl.uniform2f(rl,c.width,c.height);
  }
  window.addEventListener('resize',resize);resize();
  var t=0;
  function draw(){t+=0.05;gl.uniform1f(tl,t);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);requestAnimationFrame(draw);}
  draw();
})();
</script></body></html>`;

export function ShaderBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <WebView
        source={{html: SHADER_HTML}}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webview: {flex: 1, backgroundColor: 'transparent'},
});
