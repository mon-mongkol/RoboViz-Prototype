import dynamic from "next/dynamic";

// const MapCanvas = dynamic(() => import("./MapCanvas"), {
//     ssr: false,
// });

const ThreeScene = dynamic(() => import("./ThreeScene"), {
    ssr: false,
});

export default function Home() {
    return (
        <div>
            <h1>Robot Map</h1>
            <ThreeScene />
            {/* <MapCanvas
                width={800}
                height={600}
                cellSize={50}
                gridColor="#444"
            /> */}
        </div>
    );
}