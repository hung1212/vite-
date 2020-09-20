const fs = require('fs')
const path = require('path')
const Koa = require('koa')
const compilerSfc = require('@vue/compiler-sfc')
const compilerDom = require('@vue/compiler-dom')

const app = new Koa()

function rewriteImport(content) {
    // 目的是改造.js文件内容， 不是/ ./ ../开头的import，替换成/@modules/开头的
    return content.replace(/ from ['|"]([^'"]+)['|"]/g, function (s0, s1) {
        if (s1[0] !== '.' && s1[1] !== '/') {
            return ` from '/@modules/${s1}'`
        } else {
            return s0
        }
    })
}

app.use(ctx => {
    const { request: { url, query } } = ctx
    if (url === '/') {
        // 获取html文件
        let content = fs.readFileSync('./index.html', 'utf-8')
        content = content.replace('<script', `
            <script>
                window.process = {
                    env: {NODE_ENV: 'dev'}
                }
            </script>
            <script
        `)
        ctx.type = 'text/html'
        ctx.body = content
    } else if (url.endsWith('.js')) {
        // 网络的路径
        // http://xxx/main.js
        // 获取main.js
        const p = path.resolve(__dirname, url.slice(1))
        // 本地路径
        const content = fs.readFileSync(p, 'utf-8')
        ctx.type = 'application/javascript'
        ctx.body = rewriteImport(content)
    } else if (url.endsWith('.css')) {
        const p = path.resolve(__dirname, url.slice(1))
        ctx.type = 'text/javascript'
        let file = fs.readFileSync(p, 'utf-8')
        let content = `
            const css = "${file.replace(/\n/g, '')}"
            const link = document.createElement('style')
            link.setAttribute('type', 'text/css')
            document.head.appendChild(link)
            link.innerHTML = css
            export default css
        `
        ctx.body = content
    } else if (url.startsWith('/@modules/')) {
        // modules实际上是去node_modules文件取
        let preFix = path.resolve(__dirname, 'node_modules', url.replace('/@modules/', ''))
        let module = require(`${preFix}/package.json`).module
        let p = path.resolve(preFix, module)
        const ref = fs.readFileSync(p, 'utf-8')
        ctx.type = 'application/javascript'
        ctx.body = rewriteImport(ref)
    } else if (url.indexOf('.vue') > -1) {
        const p = path.resolve(__dirname, url.split('?')[0].slice(1))
        const { descriptor } = compilerSfc.parse(fs.readFileSync(p, 'utf-8'))
        if (!query.type) {
            ctx.type = 'application/javascript'
            ctx.body = `${descriptor.script.content.replace('export default', `const _script = `)}
                import { render as __render } from '${url}?type=template'
                _script.render = __render
                _script._hmrId = '${url}'
                _script._file = '${__dirname}${url}'
                export default _script
            `
        } else if (query.type == "template") {
            const template = descriptor.template
            const render = compilerDom.compile(template.content, { mode: 'module' }).code
            ctx.type = 'application/javascript'
            ctx.body = rewriteImport(render)
        }
    }
})


app.listen(9902, () => {
    console.log(9902)
})

