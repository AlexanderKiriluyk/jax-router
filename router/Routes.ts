const COMPONENTS :Object = {
    '#js-mini-cart-component':{
        controllerPath: "modules/miniCart/MiniCartController",
        handlerMethod: "onComponentInit"
    }
};

const ROUTES :Object = {
    "/?$": {
        controllerPath: "modules/test/TestController",
        handlerMethod: "init",
        onLeaveHandlerMethod: "onLeave"
    },
    "/test2": {
        controllerPath: "modules/test2/Test2Controller",
        handlerMethod: "onInit"
    }
};

export {COMPONENTS, ROUTES}