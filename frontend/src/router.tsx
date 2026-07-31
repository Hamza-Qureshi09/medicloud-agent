import { createBrowserRouter, Navigate } from "react-router-dom"


import { RootLayout } from "./components/layout/rootLayout"
import { RouteErrorPage } from "./pages/routeError"


export const router = createBrowserRouter([
    {
        path: "/dashboard",
        element: <RootLayout />,
        errorElement: <RouteErrorPage />,
        children: [
            {
                index: true,
                lazy: async () => ({
                    Component: (await import("@/pages/dashboard")).DashboardPage
                })
            },
            {
                path: "profiles",
                lazy: async () => ({
                    Component: (await import("@/pages/profiles")).ProfilesPage,
                }),
            },
            {
                path: "orders",
                lazy: async () => ({
                    Component: (await import("@/pages/orders")).OrdersPage,
                }),
            },


            // if no route match show this 
            {
                path: "*", element: <Navigate to={"/"} replace={true} />
            }
        ]
    }
])