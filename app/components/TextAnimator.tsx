"use client";

import { TypeAnimation } from 'react-type-animation';

export default function TextAnimator(){
    return (
        <>
            <TypeAnimation
                sequence={[
                    // Same substring at the start will only be typed out once, initially
                    'Lwin Maung Maung',
                    3000, // wait 1s before replacing "Mice" with "Hamsters"
                    'a Software Engineer',
                    3000,
                    'a Backend Developer',
                    3000,
                    'a Full-Stack Developer',
                    3000
                ]}
                wrapper="span"
                speed={50}
                repeat={Infinity}
            />
        </>
    );
}
