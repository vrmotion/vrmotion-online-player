VRMotion Online Player

Что уже сделано:
- стартовый экран на основе твоих ассетов
- переход в browser player по кнопке Watch in Browser
- простой fullscreen player
- поддержка HLS .m3u8 через hls.js
- режим AUTO для адаптивного качества
- ручной выбор качества, если в master playlist есть несколько уровней
- поддержка query params

Как запускать:
1. Открой index.html на хостинге или через локальный сервер
2. Передай ссылку на видео в параметре v

Примеры:
index.html?v=https://media.example.com/movie/master.m3u8&type=vr180
index.html?v=https://media.example.com/movie/master.m3u8&type=360&title=My%20Video
index.html?v=https://media.example.com/movie/video.mp4&type=2d

Рекомендация:
- для автоувеличения качества по скорости интернета используй именно master.m3u8
- mp4 подойдет, но без настоящего adaptive bitrate

Следующий шаг:
- подставить реальный Cloudflare URL первого видео
- при необходимости добавить JSON playlist
- затем добавить отдельную immersive VR/WebXR логику
