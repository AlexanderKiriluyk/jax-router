import {ROUTES, COMPONENTS} from "./Routes";
import {Importer} from "../Importer";
import {provide} from "../../inversify.config";
import {HttpClient, REQUEST_TYPE} from "../Http";
import * as $ from "jquery";
import "history";

const isNeedCyrillic = () :boolean =>{
    return (/MSIE/i.test(navigator.userAgent) || /rv:11.0/i.test(navigator.userAgent) || /Edge\/12./i.test(navigator.userAgent) || /firefox/i.test(navigator.userAgent));
};
const DYNAMIC_CONTENT_SECTION_SELECTOR :string = CONFIG.SPATargetContainer;
const SPA_CONTROLS_SELECTOR :string = CONFIG.SPAEmulatorSelector;
const HOST :string = CONFIG.host;
const HOST_CYR :string = CONFIG.host_cyr;
const ENTRY_POINT :string = window.location.href.replace(isNeedCyrillic() && /[а-яА-ЯЁё]/.test(window.location.href) ? HOST_CYR : HOST,"");

@provide(Router)
export class Router{

    private static instance :Router = new Router();
    private importer :Importer;
    private currentHandler = {instance: null, onLeave: null};
    private static isNotFirstStep :boolean = false;
    private physicsClick :boolean = false;
    private contentSection :JQuery;

    constructor () {
        if (Router.instance) return Router.instance;
        Router.instance = this;
        this.importer = new Importer();
        this.contentSection = $(DYNAMIC_CONTENT_SECTION_SELECTOR);
        if(this.isAvailableHistoryAPI()) this.setHistoryAPIListener();
        let handler = this.getUrlHandler(ENTRY_POINT);
        if(!handler) {
            (async () :Promise<Router> =>{
                await this.doSimpleRequest(ENTRY_POINT);
                await this.checkAndLoadComponents();
                return this;
            })();
        }else{
            (async () :Promise<Router> =>{
                let entity :Object = await this.importer.getClassEntity(handler["controllerPath"]);
                handler["controller"] = entity["classEntity"];
                this.execHandler(handler,null);
                await this.checkAndLoadComponents();
                return Router.instance;
            })();
        }
    }

    public get currentHandlerInstance () :Object{
        return this.currentHandler.instance;
    }

    public navTo = async (url :string, callback? :Function) :Promise<void> =>{
        let handler :Object = this.getUrlHandler(url);
        if(!handler) return this.doSimpleRequest(url);
        let entity :Object = await this.importer.getClassEntity(handler["controllerPath"]);
        handler["controller"] = entity["classEntity"];
        this.physicsClick = true;
        if(handler["noRequest"]){
            this.pushState(url,handler["metaTitle"]);
            await this.execHandler(handler,null);
            await this.checkAndLoadComponents(true);
            return;
        }
        await this.execHandler(handler,url,callback);
        this.pushState(url,handler["metaTitle"]);
        this.physicsClick = false;
        await this.checkAndLoadComponents(true);
    };

    private async execHandler (handler, url, callback? :Function) :Promise<void>{
        let doExec = async () =>{
            let httpClient :HttpClient = new HttpClient();
            let data :string = await httpClient.request(REQUEST_TYPE.GET, url);
            this.contentSection.html(data);
            let instance :Object = new handler.controller();
            this.currentHandler.instance = instance;
            if(handler.onLeaveHandlerMethod) this.currentHandler.onLeave = handler.onLeaveHandlerMethod;

            let exec :Function = instance[handler.handlerMethod];
            let params :Object = {};
            for(let i in handler){
                if(i == "controller" || i == "handlerMethod" || i == "onLeaveHandlerMethod" || i == "route") continue;
                params[i] = handler[i];
            }
            Router.isNotFirstStep ? $("body,html").scrollTop(0) : Router.isNotFirstStep = true;
            exec(params,data,callback);
        };

        if(this.currentHandler && this.currentHandler.onLeave) {
            await this.currentHandler.instance[this.currentHandler.onLeave](doExec);
            this.currentHandler.onLeave = null;
        }else {
            await doExec();
        }
    }

    private setHistoryAPIListener = () :void =>{
        let router :Router = this;
        this.pushState(ENTRY_POINT,document.title);
        $(document).on("click.emulateSPA", SPA_CONTROLS_SELECTOR, async function (e){
            e.preventDefault();
            let url :string = $(this).attr("href");
            await router.navTo(url);
        });

        $(window).on('popstate', async () =>{
            let url :string = location.href;
            if(this.physicsClick){
                this.physicsClick = false;
                return;
            }
            url ? await this.navTo(url) : window.location.href = ENTRY_POINT;
        });
    };

    private getUrlHandler(url) :Object{
        let cleanUrl :string = decodeURI(url.replace(HOST,""));
        return this.findHandler(cleanUrl);
    }

    private findHandler(url :string) :Object{
        for(let i in ROUTES){
            if(this.equalsUrlKeys(url,i)){
                ROUTES[i].urlParams = this.cutParameters(url,i);
                return ROUTES[i];
            }else if(ROUTES[i].route){
                let handler :Object = this.findInNestedRoute(ROUTES[i].route,i,url,ROUTES[i].controller,ROUTES[i].controllerPath);
                if(handler) return handler;
            }
        }
        return null;
    }

    private findInNestedRoute(routes :Object, currentRouteUrl :string, url :string, controller :Object, controllerPath :string) :Object{
        if(currentRouteUrl == "/") currentRouteUrl = "";
        for(let i in routes){
            let stuckUrl :string = currentRouteUrl + i;
            if(this.equalsUrlKeys(url, stuckUrl)){
                routes[i].urlParams = this.cutParameters(url,stuckUrl);
                routes[i].controller = controller;
                routes[i].controllerPath = controllerPath;
                return routes[i];
            }else{
                if(routes[i].route){
                    return this.findInNestedRoute(routes[i].route,stuckUrl,url,controller,controllerPath);
                }
            }
        }
        return false;
    }

    private doSimpleRequest = async (url) :Promise<void> =>{
        this.physicsClick = true;
        let httpClient :HttpClient = new HttpClient();
        let data : string = await httpClient.request(REQUEST_TYPE.GET, url);
        this.contentSection.html(data);
        this.pushState(url,null);
        this.physicsClick = false;
        Router.isNotFirstStep ? $("body,html").scrollTop(0) : Router.isNotFirstStep = true;
    };

    private checkAndLoadComponents = async (findInContainer :boolean = false) :Promise<void> =>{
        for(let i in COMPONENTS){
            let currentSelector :string = i.trim();
            if(!COMPONENTS.hasOwnProperty(currentSelector)) continue;
            let currentComponent :JQuery = findInContainer ? this.contentSection.find(currentSelector) : $(currentSelector);
            if(!currentComponent.length) continue;
            let component :Object = COMPONENTS[currentSelector];
            let entity :Object = await this.importer.getClassEntity(component["controllerPath"]);
            let instance = new entity["classEntity"]();
            let params :Object = {};
            for(let i in component){
                if(i != "controllerPath" && i != "handlerMethod") params[i] = component[i];
            }
            instance[component["handlerMethod"]](currentComponent,params);
        }
    };

    private equalsUrlKeys(url :string, key :string) :boolean{
        if(url.indexOf("#") !== -1) url = url.split("#")[0];
        if(url.indexOf("?") !== -1) url = url.split("?")[0];
        let re = this.makeRegExpForKeyString(key);
        return (re.test(url));
    }

    private makeRegExpForKeyString(key :string) :RegExp{
        if(key[key.length-1] != "/") key += "/";
        key = key.replace(new RegExp(":.{0,}?/+","ig"),"([A-zА-я0-9-]{0,})/");
        return new RegExp(`^${key}?$`,"ig");
    }

    private cutParameters(url :string, key :string) :Object{
        let params :Object = {}, queryString :string = null;
        if(url.indexOf("?") !== -1){
            let queryParts :Array<string> = url.split("?");
            url = queryParts[0];
            queryString = queryParts[1];
        }
        let keyParts :Object = key.split("/"), urlParts :Object = url.split("/");
        for(let i in keyParts){
            if(keyParts[i].indexOf(":") !== -1){
                params[keyParts[i].replace(":","")] = urlParts[i];
            }
        }
        if(queryString){
            let queryStringParts :Object = queryString.split("&");
            for(let i in queryStringParts){
                let qsNode :Object = queryStringParts[i].split("=");
                if(qsNode && qsNode[0] && qsNode[1]){
                    params[qsNode[0]] = qsNode[1];
                }
            }
        }
        return params;
    }

    private isAvailableHistoryAPI () :boolean{
        return !history["emulate"];
    }

    private pushState(url :string, title :string) :void{
        history.pushState({}, title, url);
    }
}