/**
 * @file github ref(branch or tag) utils
 * @author netcon
 */

import * as vscode from 'vscode';
import { getBrowserUrl } from './context';
import { reuseable } from './func';
import { getGithubBranches, getGithubTags } from '../api';

export interface RepositoryBranch {
	name: string,
	commit: {
		sha: string,
		url: string,
	},
	protected?: boolean
}

export interface RepositoryTag {
	name: string,
	commit: {
		sha: string,
		url:  string,
	},
	zipball_url: string,
	tarball_url: string,
	node_id: string,
}

let currentRef = '';
let repositoryBranches: RepositoryBranch[] = null;
let repositoryTags: RepositoryTag[] = null;

export const getRepositoryBranches = reuseable((forceUpdate: boolean = false): Promise<RepositoryBranch[]> => {
	// use the cached branches if already fetched and not forceUpdate
	if (repositoryBranches && repositoryBranches.length && !forceUpdate) {
		return Promise.resolve(repositoryBranches);
	}
	return getBrowserUrl().then(url => {
		const [owner = 'conwnet', repo = 'github1s'] = (vscode.Uri.parse(url).path || '').split('/').filter(Boolean);
		return getGithubBranches(owner, repo).then(githubBranches => (repositoryBranches = githubBranches));
	});
});

export const getRepositoryTags = reuseable((forceUpdate: boolean = false): Promise<RepositoryBranch[]> => {
	// use the cached tags if already fetched and not forceUpdate
	if (repositoryTags && repositoryTags.length && !forceUpdate) {
		return Promise.resolve(repositoryTags);
	}
	return getBrowserUrl().then(url => {
		const [owner = 'conwnet', repo = 'github1s'] = (vscode.Uri.parse(url).path || '').split('/').filter(Boolean);
		return getGithubTags(owner, repo).then(githubTags => (repositoryTags = githubTags));
	});
});

// try to find corresponding ref from branchNames or tagNames
const findMatchedBranchOrTag = (branchOrTagNames: string[], pathParts: string[]): string => {
	let partIndex = 3;
	let maybeBranch = pathParts[partIndex];

	while (branchOrTagNames.find(item => item.startsWith(maybeBranch))) {
		if (branchOrTagNames.includes(maybeBranch)) {
			return maybeBranch;
		}
		maybeBranch = `${maybeBranch}/${pathParts[++partIndex]}`;
	}
	return null;
};


// get current ref(branch or tag or commit) according current browser url
export const getCurrentRef = reuseable((forceUpdate: boolean = false): Promise<string> => {
	// cache the currentRef if we have already found it and not forceUpdate
	if (currentRef && !forceUpdate) {
		return Promise.resolve(currentRef);
	}
	return getBrowserUrl().then(url => {
		// this url should looks like `https://github.com/conwnet/github1s/tree/master/src`
		const parts = (vscode.Uri.parse(url).path || '').split('/').filter(Boolean);
		// only support tree/blob type now
		let maybeBranch = (['tree', 'blob'].includes((parts[2] || '').toLowerCase())) ? parts[3] : '';

		// if we can't get branch from url, just return `HEAD` which represents `default branch`
		if (!maybeBranch || maybeBranch.toUpperCase() === 'HEAD') {
			return 'HEAD';
		}

		const branchNamesPromise: Promise<string[]> = getRepositoryBranches().then(branches => branches.map(item => item.name));
		const tagNamesPromise: Promise<string[]> = getRepositoryTags().then(tags => tags.map(item => item.name));

		return branchNamesPromise.then((branchNames: string[]) => {
			// try to find current ref from repo branches, we needn't wait to tags request ready if can find it here
			return (currentRef = findMatchedBranchOrTag(branchNames, parts)) || tagNamesPromise.then((tagNames: string[]) => {
				// try to find current ref from repo tags, it we still can't find it here, just return `maybeBranch`
				// in this case, the `maybeBranch` could be a `commit hash` (or throw error later)
				return currentRef = (findMatchedBranchOrTag(tagNames, parts) || maybeBranch);
			});
		});
	});
});

const updateRefInUrl = (url, newRef) => {
	const uri = vscode.Uri.parse(url);
	const parts = (uri.path || '').split('/').filter(Boolean);
	return uri.with({ path: `${parts[0]}/${parts[1]}/tree/${newRef}` }).toString();
};

export const changeCurrentRef = (newRef: string): Promise<string> => {
	return getBrowserUrl().then((url: string) => {
		vscode.commands.executeCommand('github1s.vscode.replace-browser-url', updateRefInUrl(url, newRef));
		vscode.commands.executeCommand('workbench.action.closeAllGroups');
		currentRef = newRef;
		vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
		return newRef;
	});
};
