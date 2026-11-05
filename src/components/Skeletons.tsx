import React from 'react';

export const PropertyCardSkeleton: React.FC = () => {
    return (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden col-span-1 animate-pulse flex flex-col h-full">
            <div className="w-full h-48 bg-gray-200" />
            <div className="p-5 flex-1 flex flex-col">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-1" />
                <div className="h-4 bg-gray-200 rounded w-4/5 mb-6" />
                <div className="mt-auto flex justify-between gap-2">
                    <div className="h-10 bg-gray-200 rounded-md flex-1" />
                    <div className="h-10 bg-gray-200 rounded-md w-1/4" />
                </div>
            </div>
        </div>
    );
};

export const SkeletonsGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <PropertyCardSkeleton key={i} />
            ))}
        </div>
    );
};
