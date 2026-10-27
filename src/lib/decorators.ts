
import express from "express";
import type { RequestHandler, Router } from "express";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type RouteDefinition = {
    method: HttpMethod;
    path: string;
    propertyKey: string | symbol;
};

type ControllerDefinition = {
    prefix: string;
    routes: RouteDefinition[];
};

const controllers = new WeakMap<Function, ControllerDefinition>();

function getDefinition(target: Function): ControllerDefinition {
    let definition = controllers.get(target);

    if (!definition) {
        definition = {
            prefix: "",
            routes: [],
        };

        controllers.set(target, definition);
    }

    return definition;
}

export function Controller(prefix = ""): ClassDecorator {
    return (target) => {
        getDefinition(target).prefix = prefix;
    };
}

function createMethodDecorator(
    method: HttpMethod,
    path: string,
): MethodDecorator {
    return (target, propertyKey) => {
        const definition = getDefinition(target.constructor);

        definition.routes.push({
            method,
            path,
            propertyKey,
        });
    };
}

export const Get = (path = "") => createMethodDecorator("get", path);
export const Post = (path = "") => createMethodDecorator("post", path);
export const Put = (path = "") => createMethodDecorator("put", path);
export const Patch = (path = "") => createMethodDecorator("patch", path);
export const Delete = (path = "") => createMethodDecorator("delete", path);


export function registerController(
    router: Router,
    instance: object,
): void {
    const definition = controllers.get(instance.constructor);

    if (!definition) {
        throw new Error(
            `Controller ${instance.constructor.name} não foi registado.`,
        );
    }

    for (const route of definition.routes) {
        const handler = (
            instance as Record<string | symbol, unknown>
        )[route.propertyKey];

        if (typeof handler !== "function") {
            throw new Error(
                `Handler ${String(route.propertyKey)} não é uma função.`,
            );
        }

        const boundHandler = handler.bind(instance) as (
            ...args: unknown[]
        ) => unknown;

        const fullPath = `${definition.prefix}${route.path}` || "/";

        router[route.method](fullPath, async (req, res, next) => {
            try {
                const result = await boundHandler(req, res, next);

                if (res.headersSent || result === undefined) {
                    return;
                }

                if (
                    typeof result === "object" &&
                    result !== null &&
                    "status" in result &&
                    typeof result.status === "number" &&
                    "body" in result
                ) {
                    res.status(result.status).json(result.body);
                    return;
                }

                res.json(result);
            } catch (error) {
                next(error);
            }
        });
    }
}


export function createRouter(): Router {
    return express.Router();
}
